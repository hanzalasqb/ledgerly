import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import type { Client, Invoice } from "@ledgerly/shared";
import { createApp } from "../src/app";

const app = createApp({ jwtSecret: "ledgerly-test-secret".padEnd(40, "x"), today: () => "2026-11-20" });
let base = "";

async function call<T = unknown>(method: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, data: (text ? JSON.parse(text) : undefined) as T };
}

const register = async (email: string) => (await call<{ token: string }>("POST", "/api/auth/register", { name: "Test User", email, password: "a-long-password" })).data.token;

describe("Ledgerly API", () => {
  let token: string;
  let other: string;
  let client: Client;

  const draft = (overrides: Record<string, unknown> = {}) => ({
    clientId: client.id,
    currency: "USD",
    issueDate: "2026-11-01",
    dueDate: "2026-11-15",
    items: [
      { id: "a", description: "Design sprint", quantity: 1, unitPrice: 240_000 },
      { id: "b", description: "Development (hours)", quantity: 10, unitPrice: 6_500 },
    ],
    taxRate: 10,
    discount: 5_000,
    ...overrides,
  });

  before(async () => {
    await new Promise<void>((r) => app.server.listen(0, r));
    base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
    token = await register("owner@example.com");
    other = await register("other@example.com");
    client = (await call<Client>("POST", "/api/clients", { name: "Ayesha Khan", email: "ayesha@nimbus.io", company: "Nimbus Labs" }, token)).data;
  });

  after(() => app.close());

  it("requires authentication", async () => {
    assert.equal((await call("GET", "/api/invoices")).status, 401);
  });

  it("validates clients and invoices with field-level messages", async () => {
    const bad = await call<{ issues: { path: string }[] }>("POST", "/api/clients", { name: "A", email: "x" }, token);
    assert.equal(bad.status, 400);
    assert.deepEqual(bad.data.issues.map((i) => i.path).sort(), ["email", "name"]);

    const badInv = await call<{ issues: { path: string; message: string }[] }>("POST", "/api/invoices", draft({ items: [], dueDate: "2026-10-01" }), token);
    assert.equal(badInv.status, 400);
    assert.ok(badInv.data.issues.some((i) => i.path === "items"));
  });

  it("creates numbered drafts and keeps them editable", async () => {
    const a = (await call<Invoice>("POST", "/api/invoices", draft(), token)).data;
    const b = (await call<Invoice>("POST", "/api/invoices", draft(), token)).data;
    assert.equal(a.number, "INV-2026-0001");
    assert.equal(b.number, "INV-2026-0002");
    assert.equal(a.status, "draft");
    const edited = await call<Invoice>("PUT", `/api/invoices/${a.id}`, draft({ notes: "Net 14" }), token);
    assert.equal(edited.data.notes, "Net 14");
    assert.equal((await call("DELETE", `/api/invoices/${b.id}`, undefined, token)).status, 204);
  });

  it("runs the full lifecycle: send, partial payment, final payment", async () => {
    const inv = (await call<Invoice>("POST", "/api/invoices", draft(), token)).data;
    // subtotal 305,000 − 5,000 discount = 300,000; +10% tax = 330,000
    const sent = await call<Invoice>("POST", `/api/invoices/${inv.id}/send`, undefined, token);
    assert.equal(sent.data.status, "sent");
    assert.equal((await call("PUT", `/api/invoices/${inv.id}`, draft(), token)).status, 409, "sent invoices are locked");

    const tooMuch = await call("POST", `/api/invoices/${inv.id}/payments`, { amount: 330_001, date: "2026-11-10", method: "card" }, token);
    assert.equal(tooMuch.status, 400);

    const partial = await call<Invoice>("POST", `/api/invoices/${inv.id}/payments`, { amount: 130_000, date: "2026-11-10", method: "bank_transfer" }, token);
    assert.equal(partial.data.status, "sent");
    const paid = await call<Invoice>("POST", `/api/invoices/${inv.id}/payments`, { amount: 200_000, date: "2026-11-12", method: "bank_transfer" }, token);
    assert.equal(paid.data.status, "paid");
    assert.equal(paid.data.paidAt?.slice(0, 10), "2026-11-12");

    assert.equal((await call("POST", `/api/invoices/${inv.id}/void`, undefined, token)).status, 409, "paid invoices can't be voided");
    assert.equal((await call("DELETE", `/api/invoices/${inv.id}`, undefined, token)).status, 409);
  });

  it("duplicates an invoice as a new draft dated today", async () => {
    const src = (await call<Invoice>("POST", "/api/invoices", draft(), token)).data;
    const copy = (await call<Invoice>("POST", `/api/invoices/${src.id}/duplicate`, undefined, token)).data;
    assert.equal(copy.status, "draft");
    assert.equal(copy.issueDate, "2026-11-20");
    assert.equal(copy.dueDate, "2026-12-04");
    assert.notEqual(copy.number, src.number);
  });

  it("isolates tenants", async () => {
    const mine = (await call<Invoice[]>("GET", "/api/invoices", undefined, token)).data;
    assert.ok(mine.length > 0);
    assert.equal((await call<Invoice[]>("GET", "/api/invoices", undefined, other)).data.length, 0);
    assert.equal((await call("GET", `/api/invoices/${mine[0].id}`, undefined, other)).status, 404);
    assert.equal((await call("POST", "/api/invoices", draft(), other)).status, 404, "can't bill someone else's client");
  });

  it("reports revenue, receivables and cash flow in a base currency", async () => {
    await call("POST", "/api/expenses", { date: "2026-11-05", vendor: "Figma", category: "software", amount: 4_500, currency: "USD" }, token);
    const r = await call<{ summary: { revenueThisMonth: number }; cashFlow: { month: string; revenue: number; expenses: number }[] }>("GET", "/api/reports/summary?base=USD", undefined, token);
    assert.equal(r.status, 200);
    assert.equal(r.data.summary.revenueThisMonth, 330_000);
    const nov = r.data.cashFlow.at(-1)!;
    assert.equal(nov.month, "2026-11");
    assert.equal(nov.expenses, 4_500);
    assert.equal((await call("GET", "/api/reports/summary?base=XYZ", undefined, token)).status, 400);
  });
});
