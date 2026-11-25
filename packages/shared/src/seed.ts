import { invoiceTotals, lineTotal, type Currency } from "./money";
import type { Client, Expense, ExpenseCategory, Invoice, LineItem } from "./schemas";

/** Demo data for the live demo and `npm run seed`. All companies and people are fictional. */
export const DEMO_CLIENTS: Omit<Client, "createdAt">[] = [
  { id: "c-nimbus", name: "Ayesha Khan", email: "ayesha@nimbuslabs.io", company: "Nimbus Labs", country: "United States", currency: "USD", color: "#2563eb" },
  { id: "c-saffron", name: "Omar Farooq", email: "omar@saffronfoods.pk", company: "Saffron Foods", country: "Pakistan", currency: "PKR", color: "#d97706" },
  { id: "c-northwind", name: "Lena Fischer", email: "lena@northwind.de", company: "Northwind GmbH", country: "Germany", currency: "EUR", color: "#7c3aed" },
  { id: "c-brightdesk", name: "James Carter", email: "james@brightdesk.co.uk", company: "BrightDesk", country: "United Kingdom", currency: "GBP", color: "#db2777" },
  { id: "c-dunes", name: "Fatima Al Nuaimi", email: "fatima@dunesretail.ae", company: "Dunes Retail", country: "UAE", currency: "AED", color: "#0d9488" },
  { id: "c-pixel", name: "Sara Malik", email: "sara@pixelforge.io", company: "PixelForge", country: "United States", currency: "USD", color: "#16a34a" },
];

const SERVICES: [string, number][] = [
  ["Product design sprint", 2400],
  ["Frontend development (hours)", 65],
  ["Backend API development (hours)", 70],
  ["UX audit and report", 1200],
  ["Design system setup", 3200],
  ["Monthly maintenance retainer", 900],
  ["Performance optimisation", 1500],
  ["Cloud deployment and CI/CD", 1100],
];

/** Scale so PKR/AED invoices look like real local prices. */
const PRICE_SCALE: Record<Currency, number> = { USD: 1, EUR: 0.93, GBP: 0.79, PKR: 278, AED: 3.67 };

function prng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

export function demoData(today = new Date()) {
  const rand = prng(42);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(rand() * a.length)];
  const clients: Client[] = DEMO_CLIENTS.map((c, i) => ({ ...c, createdAt: addDays(today, -400 + i * 9).toISOString() }));
  const invoices: Invoice[] = [];
  const counters = new Map<number, number>();

  // Roughly three invoices a month for the last 12 months.
  for (let i = 0; i < 38; i++) {
    // Denser towards today, so recent months have drafts and open invoices.
    const issue = addDays(today, -Math.round(360 * Math.pow(1 - i / 37, 1.25) + rand() * 3));
    const client = clients[Math.floor(rand() * clients.length)];
    const year = issue.getUTCFullYear();
    counters.set(year, (counters.get(year) ?? 0) + 1);
    const items: LineItem[] = Array.from({ length: 1 + Math.floor(rand() * 3) }, (_, j) => {
      const [desc, usd] = pick(SERVICES);
      const hourly = desc.includes("hours");
      return {
        id: `li-${i}-${j}`,
        description: desc,
        quantity: hourly ? 10 + Math.floor(rand() * 50) : 1,
        unitPrice: Math.round(usd * PRICE_SCALE[client.currency]) * 100,
      };
    });
    const taxRate = client.currency === "PKR" ? 16 : client.currency === "GBP" ? 20 : client.currency === "EUR" ? 19 : client.currency === "AED" ? 5 : 0;
    const discount = rand() < 0.2 ? Math.round(lineTotal(items[0]) * 0.1) : 0;
    const due = addDays(issue, 37 - i < 6 ? 30 : pick([14, 15, 30, 30, 45]));
    const total = invoiceTotals(items, taxRate, discount).total;
    const age = (today.getTime() - issue.getTime()) / 86_400_000;

    let status: Invoice["status"] = "paid";
    let paidAt: string | null = null;
    const payments: Invoice["payments"] = [];
    // Deterministic mix by recency: 2 drafts, 4 open, 3 overdue, 1 void, the rest paid.
    const fromNewest = 37 - i;
    if (fromNewest < 2) status = "draft";
    else if (fromNewest < 6) status = "sent";
    else if (fromNewest === 8 || fromNewest === 13) status = "sent"; // these two end up overdue
    else if (fromNewest === 20) status = "void";
    void age;

    if (status === "paid") {
      const payDate = addDays(issue, 4 + Math.floor(rand() * 22));
      const date = iso(payDate > today ? today : payDate);
      payments.push({ id: `p-${i}`, amount: total, date, method: pick(["bank_transfer", "bank_transfer", "card", "cheque"] as const) });
      paidAt = `${date}T10:00:00.000Z`;
    } else if (status === "sent" && (fromNewest === 3 || fromNewest === 13)) {
      payments.push({ id: `p-${i}`, amount: Math.round(total * 0.5), date: iso(addDays(issue, 7)), method: "bank_transfer" });
    }

    invoices.push({
      id: `inv-${i + 1}`,
      number: `INV-${year}-${String(counters.get(year)).padStart(4, "0")}`,
      clientId: client.id,
      currency: client.currency,
      issueDate: iso(issue),
      dueDate: iso(due),
      items,
      taxRate,
      discount,
      notes: "Thank you for your business. Payment by bank transfer within the due date, please.",
      status,
      payments,
      sentAt: status === "draft" ? null : `${iso(issue)}T09:00:00.000Z`,
      paidAt,
      createdAt: `${iso(issue)}T08:00:00.000Z`,
      updatedAt: `${iso(issue)}T08:00:00.000Z`,
    });
  }

  const VENDORS: [string, ExpenseCategory, number][] = [
    ["Figma", "software", 45],
    ["GitHub", "software", 21],
    ["AWS", "software", 180],
    ["Vercel", "software", 20],
    ["Freelance illustrator", "contractors", 650],
    ["QA contractor", "contractors", 900],
    ["Co-working desk", "office", 220],
    ["LinkedIn Ads", "marketing", 300],
    ["Flight to Dubai", "travel", 420],
    ["MacBook Pro", "hardware", 2400],
  ];
  const expenses: Expense[] = [];
  for (let m = 0; m < 12; m++) {
    const base = addDays(today, -m * 30.4 - 3);
    for (const [vendor, category, usd] of VENDORS) {
      const recurring = category === "software" || vendor === "Co-working desk";
      if (vendor === "MacBook Pro") {
        if (m !== 7) continue;
      } else if (!recurring && rand() > (category === "contractors" ? 0.5 : 0.25)) continue;
      expenses.push({
        id: `e-${m}-${vendor.replace(/\W+/g, "").toLowerCase()}`,
        date: iso(addDays(base, -Math.floor(rand() * 20))),
        vendor,
        category,
        amount: Math.round(usd * (0.9 + rand() * 0.2)) * 100,
        currency: "USD",
      });
    }
  }
  expenses.sort((a, b) => b.date.localeCompare(a.date));
  return { clients, invoices: invoices.reverse(), expenses };
}
