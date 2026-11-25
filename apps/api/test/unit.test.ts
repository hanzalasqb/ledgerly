import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertTransition,
  cashFlow,
  convert,
  demoData,
  displayStatus,
  formatMoney,
  invoiceTotals,
  lineTotal,
  monthKeys,
  nextInvoiceNumber,
  summarize,
  toMinor,
  type Invoice,
} from "@ledgerly/shared";

describe("money", () => {
  it("parses major units into integer minor units", () => {
    assert.equal(toMinor("1,234.56"), 123456);
    assert.equal(toMinor(0.1 + 0.2), 30);
    assert.equal(toMinor("abc"), 0);
  });

  it("rounds each line half away from zero", () => {
    assert.equal(lineTotal({ quantity: 1.5, unitPrice: 333 }), 500); // 499.5 → 500
    assert.equal(lineTotal({ quantity: 3, unitPrice: 3333 }), 9999);
  });

  it("computes subtotal, discount, tax and total", () => {
    const t = invoiceTotals([{ quantity: 2, unitPrice: 10_000 }, { quantity: 1, unitPrice: 5_050 }], 17, 1_000);
    assert.deepEqual(t, { subtotal: 25_050, discount: 1_000, taxable: 24_050, tax: 4_089, total: 28_139 });
  });

  it("caps the discount at the subtotal", () => {
    assert.equal(invoiceTotals([{ quantity: 1, unitPrice: 500 }], 10, 9_999).total, 0);
  });

  it("converts between currencies and formats them", () => {
    assert.equal(convert(10_000, "USD", "USD"), 10_000);
    assert.equal(convert(10_000, "EUR", "USD"), 10_800);
    assert.equal(formatMoney(123456, "USD"), "$1,234.56");
    assert.match(formatMoney(5_000_000, "PKR"), /PKR\s?50,000\.00/);
  });
});

describe("workflow", () => {
  it("allows only valid status transitions", () => {
    assertTransition("draft", "sent");
    assertTransition("sent", "void");
    assert.throws(() => assertTransition("paid", "void"));
    assert.throws(() => assertTransition("draft", "paid"));
  });

  it("derives overdue and partially paid", () => {
    const base = { status: "sent", dueDate: "2026-03-01", payments: [] } as unknown as Invoice;
    assert.equal(displayStatus(base, "2026-03-02"), "overdue");
    assert.equal(displayStatus(base, "2026-03-01"), "sent");
    assert.equal(displayStatus({ ...base, payments: [{ id: "p", amount: 1, date: "2026-02-20", method: "cash" }] }, "2026-02-25"), "partial");
  });

  it("numbers invoices sequentially per year", () => {
    assert.equal(nextInvoiceNumber([], 2026), "INV-2026-0001");
    assert.equal(nextInvoiceNumber(["INV-2026-0009", "INV-2025-0042"], 2026), "INV-2026-0010");
  });
});

describe("reports", () => {
  const today = "2026-11-20";
  const data = demoData(new Date(`${today}T12:00:00Z`));

  it("builds 12 monthly buckets ending this month", () => {
    const keys = monthKeys(today, 12);
    assert.equal(keys.length, 12);
    assert.equal(keys.at(-1), "2026-11");
    assert.equal(keys[0], "2025-12");
    const flow = cashFlow(data.invoices, data.expenses, "USD", today);
    assert.ok(flow.every((p) => p.net === p.revenue - p.expenses));
    assert.ok(flow.reduce((s, p) => s + p.revenue, 0) > 0);
  });

  it("summarises receivables with aging buckets that add up", () => {
    const s = summarize(data.invoices, "USD", today);
    assert.ok(s.outstandingCount > 0 && s.overdueCount > 0);
    assert.equal(s.aging.reduce((a, b) => a + b.amount, 0), s.outstanding);
    assert.ok(s.overdue <= s.outstanding);
  });
});
