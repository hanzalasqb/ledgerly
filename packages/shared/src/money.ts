/**
 * Money is stored as integer minor units (cents, paisa) so totals never suffer floating-point drift.
 * Rounding happens once per line, half away from zero, the way most invoicing tools and tax offices expect.
 */

export const CURRENCIES = ["USD", "EUR", "GBP", "PKR", "AED"] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Indicative rates to USD used for the dashboard's base-currency roll-up (documented in the README). */
export const USD_RATE: Record<Currency, number> = { USD: 1, EUR: 1.08, GBP: 1.27, PKR: 0.0036, AED: 0.2723 };

export function convert(minor: number, from: Currency, to: Currency): number {
  if (from === to) return minor;
  return roundHalfAway((minor * USD_RATE[from]) / USD_RATE[to]);
}

export function roundHalfAway(n: number): number {
  return Math.sign(n) * Math.round(Math.abs(n));
}

/** "1,234.50" → 123450. Accepts plain numbers; ignores thousands separators. */
export function toMinor(major: number | string): number {
  const n = typeof major === "string" ? Number(major.replace(/,/g, "")) : major;
  if (!Number.isFinite(n)) return 0;
  return roundHalfAway(n * 100);
}

export const toMajor = (minor: number) => minor / 100;

const formatters = new Map<string, Intl.NumberFormat>();
export function formatMoney(minor: number, currency: Currency, opts: { compact?: boolean } = {}): string {
  const key = `${currency}:${opts.compact ? 1 : 0}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      notation: opts.compact ? "compact" : "standard",
      maximumFractionDigits: opts.compact ? 1 : 2,
      minimumFractionDigits: opts.compact ? 0 : 2,
    });
    formatters.set(key, f);
  }
  return f.format(minor / 100);
}

export interface LineLike {
  quantity: number;
  unitPrice: number; // minor units
}

export function lineTotal(line: LineLike): number {
  return roundHalfAway(line.quantity * line.unitPrice);
}

export interface Totals {
  subtotal: number;
  discount: number;
  taxable: number;
  tax: number;
  total: number;
}

/**
 * subtotal − discount = taxable; tax = taxable × rate. Discount is capped at the subtotal,
 * so a total can never go negative.
 */
export function invoiceTotals(items: LineLike[], taxRatePercent: number, discountMinor: number): Totals {
  const subtotal = items.reduce((sum, l) => sum + lineTotal(l), 0);
  const discount = Math.min(Math.max(0, discountMinor), subtotal);
  const taxable = subtotal - discount;
  const tax = roundHalfAway((taxable * taxRatePercent) / 100);
  return { subtotal, discount, taxable, tax, total: taxable + tax };
}
