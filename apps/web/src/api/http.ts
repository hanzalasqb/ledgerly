import type { Client, Expense, Invoice } from "@ledgerly/shared";
import { ApiError, type LedgerlyClient } from "./client";

const API = (import.meta.env.VITE_API_URL as string | undefined) ?? "";
const KEY = "ledgerly.session";

/** REST client for the Node.js API. */
export function createHttpClient(): LedgerlyClient {
  let session: { token: string; user: { name: string; email: string } } | null = null;
  try {
    session = JSON.parse(localStorage.getItem(KEY) ?? "null");
  } catch {
    session = null;
  }

  async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(API + path, {
      method,
      headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(session ? { Authorization: `Bearer ${session.token}` } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return undefined as T;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(data.error ?? res.statusText, res.status, data.issues);
    return data as T;
  }

  const keep = (s: NonNullable<typeof session>) => {
    session = s;
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* in-memory only */
    }
  };

  return {
    mode: "live",
    hasSession: () => !!session,
    async login(email, password) {
      keep(await req("POST", "/api/auth/login", { email, password }));
    },
    async register(name, email, password) {
      keep(await req("POST", "/api/auth/register", { name, email, password }));
    },
    logout() {
      session = null;
      try {
        localStorage.removeItem(KEY);
      } catch {
        /* ignore */
      }
    },
    async load() {
      const [clients, invoices, expenses] = await Promise.all([req<Client[]>("GET", "/api/clients"), req<Invoice[]>("GET", "/api/invoices"), req<Expense[]>("GET", "/api/expenses")]);
      return { user: session!.user, clients, invoices, expenses };
    },
    createClient: (input) => req("POST", "/api/clients", input),
    updateClient: (id, input) => req("PUT", `/api/clients/${id}`, input),
    createInvoice: (input) => req("POST", "/api/invoices", input),
    updateInvoice: (id, input) => req("PUT", `/api/invoices/${id}`, input),
    deleteInvoice: (id) => req("DELETE", `/api/invoices/${id}`),
    sendInvoice: (id) => req("POST", `/api/invoices/${id}/send`),
    voidInvoice: (id) => req("POST", `/api/invoices/${id}/void`),
    recordPayment: (id, p) => req("POST", `/api/invoices/${id}/payments`, p),
    duplicateInvoice: (id) => req("POST", `/api/invoices/${id}/duplicate`),
    createExpense: (input) => req("POST", "/api/expenses", input),
    deleteExpense: (id) => req("DELETE", `/api/expenses/${id}`),
  };
}
