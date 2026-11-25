import { convert, invoiceTotals, type Currency } from "./money";
import type { DisplayStatus, Expense, Invoice, StoredStatus } from "./schemas";

/** Allowed status changes. Paid is reached by recording payments, never set directly. */
const TRANSITIONS: Record<StoredStatus, StoredStatus[]> = {
  draft: ["sent", "void"],
  sent: ["paid", "void"],
  paid: [],
  void: [],
};

export class WorkflowError extends Error {}

export function assertTransition(from: StoredStatus, to: StoredStatus) {
  if (!TRANSITIONS[from].includes(to)) throw new WorkflowError(`An invoice can't go from ${from} to ${to}`);
}

export const isEditable = (inv: Pick<Invoice, "status">) => inv.status === "draft";

export const totalsOf = (inv: Pick<Invoice, "items" | "taxRate" | "discount">) => invoiceTotals(inv.items, inv.taxRate, inv.discount);
export const paidOf = (inv: Pick<Invoice, "payments">) => inv.payments.reduce((s, p) => s + p.amount, 0);
export const dueOf = (inv: Invoice) => Math.max(0, totalsOf(inv).total - paidOf(inv));

export function displayStatus(inv: Invoice, today: string): DisplayStatus {
  if (inv.status !== "sent") return inv.status;
  if (inv.dueDate < today) return "overdue";
  return paidOf(inv) > 0 ? "partial" : "sent";
}

export const STATUS_LABEL: Record<DisplayStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  partial: "Partially paid",
  overdue: "Overdue",
  paid: "Paid",
  void: "Void",
};

/** "INV-2026-0007" — numbers are sequential per year. */
export function nextInvoiceNumber(existing: string[], year: number): string {
  const prefix = `INV-${year}-`;
  const max = existing.filter((n) => n.startsWith(prefix)).reduce((m, n) => Math.max(m, Number(n.slice(prefix.length)) || 0), 0);
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

const DAY = 86_400_000;
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);

/* ---------- reporting ---------- */

export interface MonthPoint {
  month: string; // YYYY-MM
  revenue: number; // minor units, base currency, by payment date
  expenses: number;
  net: number;
}

export function monthKeys(today: string, count: number): string[] {
  const [y, m] = today.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (count - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

export function cashFlow(invoices: Invoice[], expenses: Expense[], base: Currency, today: string, months = 12): MonthPoint[] {
  const keys = monthKeys(today, months);
  const map = new Map(keys.map((k) => [k, { month: k, revenue: 0, expenses: 0, net: 0 }]));
  for (const inv of invoices) {
    if (inv.status === "void") continue;
    for (const p of inv.payments) {
      const row = map.get(p.date.slice(0, 7));
      if (row) row.revenue += convert(p.amount, inv.currency, base);
    }
  }
  for (const e of expenses) {
    const row = map.get(e.date.slice(0, 7));
    if (row) row.expenses += convert(e.amount, e.currency, base);
  }
  return keys.map((k) => {
    const r = map.get(k)!;
    return { ...r, net: r.revenue - r.expenses };
  });
}

export interface Summary {
  revenueThisMonth: number;
  revenueLastMonth: number;
  revenueChange: number | null; // percent
  outstanding: number;
  outstandingCount: number;
  overdue: number;
  overdueCount: number;
  avgDaysToPay: number | null;
  aging: { label: string; amount: number }[];
}

export function summarize(invoices: Invoice[], base: Currency, today: string): Summary {
  const [thisMonth, lastMonth] = [monthKeys(today, 1)[0], monthKeys(today, 2)[0]];
  let revenueThisMonth = 0;
  let revenueLastMonth = 0;
  let outstanding = 0;
  let outstandingCount = 0;
  let overdue = 0;
  let overdueCount = 0;
  const payDays: number[] = [];
  const aging = [
    { label: "Not yet due", amount: 0 },
    { label: "1–30 days", amount: 0 },
    { label: "31–60 days", amount: 0 },
    { label: "60+ days", amount: 0 },
  ];

  for (const inv of invoices) {
    if (inv.status === "void" || inv.status === "draft") continue;
    for (const p of inv.payments) {
      const amt = convert(p.amount, inv.currency, base);
      if (p.date.startsWith(thisMonth)) revenueThisMonth += amt;
      else if (p.date.startsWith(lastMonth)) revenueLastMonth += amt;
    }
    if (inv.status === "paid" && inv.paidAt) payDays.push(Math.max(0, days(inv.issueDate, inv.paidAt.slice(0, 10))));
    if (inv.status === "sent") {
      const due = convert(dueOf(inv), inv.currency, base);
      outstanding += due;
      outstandingCount++;
      const late = days(inv.dueDate, today);
      if (late > 0) {
        overdue += due;
        overdueCount++;
      }
      aging[late <= 0 ? 0 : late <= 30 ? 1 : late <= 60 ? 2 : 3].amount += due;
    }
  }

  return {
    revenueThisMonth,
    revenueLastMonth,
    revenueChange: revenueLastMonth ? Math.round(((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 1000) / 10 : null,
    outstanding,
    outstandingCount,
    overdue,
    overdueCount,
    avgDaysToPay: payDays.length ? Math.round(payDays.reduce((a, b) => a + b, 0) / payDays.length) : null,
    aging,
  };
}

export function topClients(invoices: Invoice[], base: Currency, limit = 5) {
  const totals = new Map<string, number>();
  for (const inv of invoices) {
    if (inv.status === "void") continue;
    const paid = convert(paidOf(inv), inv.currency, base);
    totals.set(inv.clientId, (totals.get(inv.clientId) ?? 0) + paid);
  }
  return [...totals.entries()]
    .map(([clientId, total]) => ({ clientId, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}
