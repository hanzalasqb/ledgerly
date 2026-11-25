import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  assertTransition,
  ClientInput,
  dueOf,
  ExpenseInput,
  InvoiceInput,
  isEditable,
  nextInvoiceNumber,
  WorkflowError,
  type Client,
  type Expense,
  type Invoice,
  type PaymentInput,
} from "@ledgerly/shared";
import { HttpError } from "./http";

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, email TEXT NOT NULL, company TEXT NOT NULL, country TEXT NOT NULL,
  currency TEXT NOT NULL, color TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  number TEXT NOT NULL, client_id TEXT NOT NULL REFERENCES clients(id),
  currency TEXT NOT NULL, issue_date TEXT NOT NULL, due_date TEXT NOT NULL,
  items TEXT NOT NULL, tax_rate REAL NOT NULL, discount INTEGER NOT NULL, notes TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','sent','paid','void')), payments TEXT NOT NULL DEFAULT '[]',
  sent_at TEXT, paid_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE (owner_id, number)
);
CREATE INDEX IF NOT EXISTS invoices_owner_issue ON invoices(owner_id, issue_date DESC);
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL, vendor TEXT NOT NULL, category TEXT NOT NULL, amount INTEGER NOT NULL, currency TEXT NOT NULL
);
`;

type Row = Record<string, unknown>;
const now = () => new Date().toISOString();
const COLORS = ["#2563eb", "#d97706", "#7c3aed", "#db2777", "#0d9488", "#16a34a"];

const toClient = (r: Row): Client => ({
  id: r.id as string,
  name: r.name as string,
  email: r.email as string,
  company: r.company as string,
  country: r.country as string,
  currency: r.currency as Client["currency"],
  color: r.color as string,
  createdAt: r.created_at as string,
});

const toInvoice = (r: Row): Invoice => ({
  id: r.id as string,
  number: r.number as string,
  clientId: r.client_id as string,
  currency: r.currency as Invoice["currency"],
  issueDate: r.issue_date as string,
  dueDate: r.due_date as string,
  items: JSON.parse(r.items as string),
  taxRate: r.tax_rate as number,
  discount: r.discount as number,
  notes: r.notes as string,
  status: r.status as Invoice["status"],
  payments: JSON.parse(r.payments as string),
  sentAt: (r.sent_at as string | null) ?? null,
  paidAt: (r.paid_at as string | null) ?? null,
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
});

const toExpense = (r: Row): Expense => ({
  id: r.id as string,
  date: r.date as string,
  vendor: r.vendor as string,
  category: r.category as Expense["category"],
  amount: r.amount as number,
  currency: r.currency as Expense["currency"],
});

/** Every query is scoped by owner, so one account can never read or change another's books. */
export class Store {
  readonly db: DatabaseSync;

  constructor(file = ":memory:") {
    this.db = new DatabaseSync(file);
    this.db.exec(SCHEMA);
  }

  private tx<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const out = fn();
      this.db.exec("COMMIT");
      return out;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  /* ----- users ----- */

  createUser(name: string, email: string, passwordHash: string) {
    if (this.findUserByEmail(email)) throw new HttpError(409, "An account with this email already exists");
    const user = { id: randomUUID(), name, email, passwordHash };
    this.db.prepare("INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)").run(user.id, name, email, passwordHash, now());
    return user;
  }

  findUserByEmail(email: string) {
    const r = this.db.prepare("SELECT * FROM users WHERE email = ?").get(email) as Row | undefined;
    return r && { id: r.id as string, name: r.name as string, email: r.email as string, passwordHash: r.password_hash as string };
  }

  /* ----- clients ----- */

  listClients(owner: string): Client[] {
    return (this.db.prepare("SELECT * FROM clients WHERE owner_id = ? ORDER BY company, name").all(owner) as Row[]).map(toClient);
  }

  getClient(owner: string, id: string): Client {
    const r = this.db.prepare("SELECT * FROM clients WHERE owner_id = ? AND id = ?").get(owner, id) as Row | undefined;
    if (!r) throw new HttpError(404, "Client not found");
    return toClient(r);
  }

  createClient(owner: string, raw: ClientInput, id: string = randomUUID()): Client {
    const input = ClientInput.parse(raw);
    const count = (this.db.prepare("SELECT COUNT(*) AS n FROM clients WHERE owner_id = ?").get(owner) as { n: number }).n;
    const c: Client = { id, ...input, color: COLORS[count % COLORS.length], createdAt: now() };
    this.db
      .prepare("INSERT INTO clients (id, owner_id, name, email, company, country, currency, color, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(c.id, owner, c.name, c.email, c.company, c.country, c.currency, c.color, c.createdAt);
    return c;
  }

  updateClient(owner: string, id: string, raw: ClientInput): Client {
    const current = this.getClient(owner, id);
    const input = ClientInput.parse(raw);
    const c = { ...current, ...input };
    this.db.prepare("UPDATE clients SET name = ?, email = ?, company = ?, country = ?, currency = ? WHERE owner_id = ? AND id = ?").run(c.name, c.email, c.company, c.country, c.currency, owner, id);
    return c;
  }

  /* ----- invoices ----- */

  listInvoices(owner: string): Invoice[] {
    return (this.db.prepare("SELECT * FROM invoices WHERE owner_id = ? ORDER BY issue_date DESC, number DESC").all(owner) as Row[]).map(toInvoice);
  }

  getInvoice(owner: string, id: string): Invoice {
    const r = this.db.prepare("SELECT * FROM invoices WHERE owner_id = ? AND id = ?").get(owner, id) as Row | undefined;
    if (!r) throw new HttpError(404, "Invoice not found");
    return toInvoice(r);
  }

  private save(owner: string, inv: Invoice) {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO invoices (id, owner_id, number, client_id, currency, issue_date, due_date, items, tax_rate, discount, notes, status, payments, sent_at, paid_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(inv.id, owner, inv.number, inv.clientId, inv.currency, inv.issueDate, inv.dueDate, JSON.stringify(inv.items), inv.taxRate, inv.discount, inv.notes, inv.status, JSON.stringify(inv.payments), inv.sentAt, inv.paidAt, inv.createdAt, inv.updatedAt);
    return inv;
  }

  createInvoice(owner: string, raw: InvoiceInput): Invoice {
    const input = InvoiceInput.parse(raw);
    this.getClient(owner, input.clientId);
    return this.tx(() => {
      const numbers = (this.db.prepare("SELECT number FROM invoices WHERE owner_id = ?").all(owner) as { number: string }[]).map((r) => r.number);
      const ts = now();
      return this.save(owner, {
        id: randomUUID(),
        number: nextInvoiceNumber(numbers, Number(input.issueDate.slice(0, 4))),
        ...input,
        status: "draft",
        payments: [],
        sentAt: null,
        paidAt: null,
        createdAt: ts,
        updatedAt: ts,
      });
    });
  }

  /** Imports a complete invoice (used by the seed script). */
  importInvoice(owner: string, inv: Invoice) {
    return this.save(owner, inv);
  }

  updateInvoice(owner: string, id: string, raw: InvoiceInput): Invoice {
    const current = this.getInvoice(owner, id);
    if (!isEditable(current)) throw new HttpError(409, "Only draft invoices can be edited. Void it and create a new one instead.");
    const input = InvoiceInput.parse(raw);
    this.getClient(owner, input.clientId);
    return this.save(owner, { ...current, ...input, updatedAt: now() });
  }

  deleteInvoice(owner: string, id: string) {
    const inv = this.getInvoice(owner, id);
    if (inv.status !== "draft") throw new HttpError(409, "Only drafts can be deleted; void sent invoices instead");
    this.db.prepare("DELETE FROM invoices WHERE owner_id = ? AND id = ?").run(owner, id);
  }

  transition(owner: string, id: string, to: "sent" | "void"): Invoice {
    const inv = this.getInvoice(owner, id);
    try {
      assertTransition(inv.status, to);
    } catch (e) {
      if (e instanceof WorkflowError) throw new HttpError(409, e.message);
      throw e;
    }
    const ts = now();
    return this.save(owner, { ...inv, status: to, sentAt: to === "sent" ? ts : inv.sentAt, updatedAt: ts });
  }

  recordPayment(owner: string, id: string, payment: PaymentInput): Invoice {
    return this.tx(() => {
      const inv = this.getInvoice(owner, id);
      if (inv.status !== "sent") throw new HttpError(409, "Payments can only be recorded on sent invoices");
      const due = dueOf(inv);
      if (payment.amount > due) throw new HttpError(400, "Payment is more than the amount due", { due });
      const payments = [...inv.payments, { id: randomUUID(), ...payment }];
      const fullyPaid = payment.amount === due;
      return this.save(owner, { ...inv, payments, status: fullyPaid ? "paid" : "sent", paidAt: fullyPaid ? `${payment.date}T00:00:00.000Z` : null, updatedAt: now() });
    });
  }

  duplicateInvoice(owner: string, id: string, today: string): Invoice {
    const src = this.getInvoice(owner, id);
    const termDays = Math.round((Date.parse(src.dueDate) - Date.parse(src.issueDate)) / 86_400_000);
    const due = new Date(Date.parse(today) + termDays * 86_400_000).toISOString().slice(0, 10);
    return this.createInvoice(owner, { clientId: src.clientId, currency: src.currency, issueDate: today, dueDate: due, items: src.items.map((i) => ({ ...i, id: randomUUID() })), taxRate: src.taxRate, discount: src.discount, notes: src.notes });
  }

  /* ----- expenses ----- */

  listExpenses(owner: string): Expense[] {
    return (this.db.prepare("SELECT * FROM expenses WHERE owner_id = ? ORDER BY date DESC").all(owner) as Row[]).map(toExpense);
  }

  createExpense(owner: string, raw: ExpenseInput): Expense {
    const e: Expense = { id: randomUUID(), ...ExpenseInput.parse(raw) };
    this.db.prepare("INSERT INTO expenses (id, owner_id, date, vendor, category, amount, currency) VALUES (?, ?, ?, ?, ?, ?, ?)").run(e.id, owner, e.date, e.vendor, e.category, e.amount, e.currency);
    return e;
  }

  deleteExpense(owner: string, id: string) {
    const r = this.db.prepare("DELETE FROM expenses WHERE owner_id = ? AND id = ?").run(owner, id);
    if (!r.changes) throw new HttpError(404, "Expense not found");
  }

  close() {
    this.db.close();
  }
}
