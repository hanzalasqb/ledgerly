import { useSyncExternalStore } from "react";
import type { Client, ClientInput, Currency, Expense, ExpenseInput, Invoice, InvoiceInput, PaymentInput } from "@ledgerly/shared";
import { client } from "./api";
import { ApiError } from "./api/client";

export interface Toast {
  id: number;
  message: string;
  tone: "success" | "error" | "info";
}

export interface State {
  phase: "loading" | "ready" | "signed-out" | "error";
  error: string | null;
  user: { name: string; email: string } | null;
  clients: Client[];
  invoices: Invoice[];
  expenses: Expense[];
  base: Currency;
  toasts: Toast[];
}

const BASE_KEY = "ledgerly.base";
const storedBase = (): Currency => {
  try {
    return (localStorage.getItem(BASE_KEY) as Currency | null) ?? "USD";
  } catch {
    return "USD";
  }
};

let state: State = { phase: client.hasSession() ? "loading" : "signed-out", error: null, user: null, clients: [], invoices: [], expenses: [], base: storedBase(), toasts: [] };
const listeners = new Set<() => void>();
const set = (p: Partial<State> | ((s: State) => Partial<State>)) => {
  state = { ...state, ...(typeof p === "function" ? p(state) : p) };
  listeners.forEach((l) => l());
};

export const useStore = <T,>(sel: (s: State) => T): T =>
  useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => sel(state),
    () => sel(state),
  );

let toastId = 0;
export function toast(message: string, tone: Toast["tone"] = "success") {
  const id = ++toastId;
  set((s) => ({ toasts: [...s.toasts, { id, message, tone }].slice(-3) }));
  setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3800);
}

export const errorText = (e: unknown) => (e instanceof ApiError ? (e.issues[0]?.message ?? e.message) : "Something went wrong. Please try again.");

/** Runs a mutation, reports errors as a toast and re-throws so forms can show field errors. */
async function mutate<T>(fn: () => Promise<T>, success?: (r: T) => string): Promise<T> {
  try {
    const r = await fn();
    if (success) toast(success(r));
    return r;
  } catch (e) {
    toast(errorText(e), "error");
    throw e;
  }
}

const upsert = <T extends { id: string }>(list: T[], item: T) => (list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [item, ...list]);
const putInvoice = (inv: Invoice) => (set((s) => ({ invoices: upsert(s.invoices, inv) })), inv);

export const actions = {
  async load() {
    set({ phase: "loading" });
    try {
      set({ phase: "ready", ...(await client.load()) });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        client.logout();
        set({ phase: "signed-out" });
      } else set({ phase: "error", error: errorText(e) });
    }
  },
  async signIn(mode: "login" | "register", name: string, email: string, password: string) {
    if (mode === "login") await client.login(email, password);
    else await client.register(name, email, password);
    await actions.load();
  },
  signOut() {
    client.logout();
    set({ phase: "signed-out" });
  },
  setBase(base: Currency) {
    try {
      localStorage.setItem(BASE_KEY, base);
    } catch {
      /* ignore */
    }
    set({ base });
  },
  saveClient: (input: ClientInput, id?: string) =>
    mutate(
      async () => {
        const c = id ? await client.updateClient(id, input) : await client.createClient(input);
        set((s) => ({ clients: upsert(s.clients, c) }));
        return c;
      },
      (c) => (id ? `Saved ${c.company || c.name}` : `Added ${c.company || c.name}`),
    ),
  saveInvoice: (input: InvoiceInput, id?: string) => mutate(async () => putInvoice(id ? await client.updateInvoice(id, input) : await client.createInvoice(input)), (i) => `Saved ${i.number}`),
  sendInvoice: (id: string) => mutate(async () => putInvoice(await client.sendInvoice(id)), (i) => `${i.number} marked as sent`),
  voidInvoice: (id: string) => mutate(async () => putInvoice(await client.voidInvoice(id)), (i) => `${i.number} voided`),
  duplicateInvoice: (id: string) => mutate(async () => putInvoice(await client.duplicateInvoice(id)), (i) => `Created ${i.number} from copy`),
  recordPayment: (id: string, p: PaymentInput) => mutate(async () => putInvoice(await client.recordPayment(id, p)), (i) => (i.status === "paid" ? `${i.number} is fully paid` : `Payment recorded on ${i.number}`)),
  deleteInvoice: (id: string) =>
    mutate(
      async () => {
        await client.deleteInvoice(id);
        set((s) => ({ invoices: s.invoices.filter((i) => i.id !== id) }));
      },
      () => "Draft deleted",
    ),
  addExpense: (input: ExpenseInput) =>
    mutate(
      async () => {
        const e = await client.createExpense(input);
        set((s) => ({ expenses: [e, ...s.expenses].sort((a, b) => b.date.localeCompare(a.date)) }));
        return e;
      },
      (e) => `Added ${e.vendor}`,
    ),
  deleteExpense: (id: string) =>
    mutate(
      async () => {
        await client.deleteExpense(id);
        set((s) => ({ expenses: s.expenses.filter((e) => e.id !== id) }));
      },
      () => "Expense removed",
    ),
};
