import {
  assertTransition,
  ClientInput,
  demoData,
  dueOf,
  ExpenseInput,
  InvoiceInput,
  isEditable,
  nextInvoiceNumber,
  PaymentInput,
  type Client,
  type Expense,
  type Invoice,
} from "@ledgerly/shared";
import { ApiError, toApiError, type LedgerlyClient } from "./client";

const KEY = "ledgerly.demo.v1";
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
const now = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);
const COLORS = ["#2563eb", "#d97706", "#7c3aed", "#db2777", "#0d9488", "#16a34a"];

interface State {
  version: 1;
  clients: Client[];
  invoices: Invoice[];
  expenses: Expense[];
}

function load(): State {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as State | null;
    if (s?.version === 1) return s;
  } catch {
    /* fall through */
  }
  return { version: 1, ...demoData() };
}

const pause = () => new Promise((r) => setTimeout(r, 150 + Math.random() * 150));

/** In-browser backend for the live demo. Same validation and workflow rules as the API (shared package). */
export function createDemoClient(): LedgerlyClient {
  let s = load();
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* in-memory only */
    }
  };
  const run = async <T,>(fn: () => T): Promise<T> => {
    await pause();
    try {
      const out = fn();
      save();
      return out;
    } catch (e) {
      throw toApiError(e);
    }
  };
  const find = (id: string) => {
    const inv = s.invoices.find((i) => i.id === id);
    if (!inv) throw new ApiError("Invoice not found", 404);
    return inv;
  };
  const put = (inv: Invoice) => {
    s.invoices = s.invoices.some((i) => i.id === inv.id) ? s.invoices.map((i) => (i.id === inv.id ? inv : i)) : [inv, ...s.invoices];
    return inv;
  };
  const transition = (id: string, to: "sent" | "void") =>
    run(() => {
      const inv = find(id);
      try {
        assertTransition(inv.status, to);
      } catch (e) {
        throw new ApiError((e as Error).message, 409);
      }
      return put({ ...inv, status: to, sentAt: to === "sent" ? now() : inv.sentAt, updatedAt: now() });
    });
  const create = (raw: InvoiceInput) => {
    const input = InvoiceInput.parse(raw);
    const ts = now();
    return put({ id: uid(), number: nextInvoiceNumber(s.invoices.map((i) => i.number), Number(input.issueDate.slice(0, 4))), ...input, status: "draft", payments: [], sentAt: null, paidAt: null, createdAt: ts, updatedAt: ts });
  };

  return {
    mode: "demo",
    hasSession: () => true,
    async login() {},
    async register() {},
    logout() {
      try {
        localStorage.removeItem(KEY);
      } catch {
        /* ignore */
      }
      location.hash = "";
      location.reload();
    },
    load: () => run(() => ({ user: { name: "Hanzala Saqib", email: "hanzala@ledgerly.dev" }, clients: s.clients, invoices: s.invoices, expenses: s.expenses })),
    createClient: (raw) =>
      run(() => {
        const c: Client = { id: uid(), ...ClientInput.parse(raw), color: COLORS[s.clients.length % COLORS.length], createdAt: now() };
        s.clients = [...s.clients, c];
        return c;
      }),
    updateClient: (id, raw) =>
      run(() => {
        const current = s.clients.find((c) => c.id === id);
        if (!current) throw new ApiError("Client not found", 404);
        const c = { ...current, ...ClientInput.parse(raw) };
        s.clients = s.clients.map((x) => (x.id === id ? c : x));
        return c;
      }),
    createInvoice: (raw) => run(() => create(raw)),
    updateInvoice: (id, raw) =>
      run(() => {
        const inv = find(id);
        if (!isEditable(inv)) throw new ApiError("Only draft invoices can be edited", 409);
        return put({ ...inv, ...InvoiceInput.parse(raw), updatedAt: now() });
      }),
    deleteInvoice: (id) =>
      run(() => {
        if (find(id).status !== "draft") throw new ApiError("Only drafts can be deleted", 409);
        s.invoices = s.invoices.filter((i) => i.id !== id);
      }),
    sendInvoice: (id) => transition(id, "sent"),
    voidInvoice: (id) => transition(id, "void"),
    recordPayment: (id, raw) =>
      run(() => {
        const p = PaymentInput.parse(raw);
        const inv = find(id);
        if (inv.status !== "sent") throw new ApiError("Payments can only be recorded on sent invoices", 409);
        const due = dueOf(inv);
        if (p.amount > due) throw new ApiError("Payment is more than the amount due", 400);
        const full = p.amount === due;
        return put({ ...inv, payments: [...inv.payments, { id: uid(), ...p }], status: full ? "paid" : "sent", paidAt: full ? `${p.date}T00:00:00.000Z` : null, updatedAt: now() });
      }),
    duplicateInvoice: (id) =>
      run(() => {
        const src = find(id);
        const term = Math.round((Date.parse(src.dueDate) - Date.parse(src.issueDate)) / 86_400_000);
        const due = new Date(Date.parse(today()) + term * 86_400_000).toISOString().slice(0, 10);
        return create({ clientId: src.clientId, currency: src.currency, issueDate: today(), dueDate: due, items: src.items.map((i) => ({ ...i, id: uid() })), taxRate: src.taxRate, discount: src.discount, notes: src.notes });
      }),
    createExpense: (raw) =>
      run(() => {
        const e: Expense = { id: uid(), ...ExpenseInput.parse(raw) };
        s.expenses = [e, ...s.expenses].sort((a, b) => b.date.localeCompare(a.date));
        return e;
      }),
    deleteExpense: (id) =>
      run(() => {
        s.expenses = s.expenses.filter((e) => e.id !== id);
      }),
  };
}
