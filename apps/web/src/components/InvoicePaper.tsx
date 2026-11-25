import { formatMoney, invoiceTotals, lineTotal, STATUS_LABEL, type Client, type Currency, type DisplayStatus, type LineItem, type Payment } from "@ledgerly/shared";
import { fmtDate } from "../lib/format";

export interface PaperProps {
  number: string;
  status: DisplayStatus;
  client?: Client;
  currency: Currency;
  issueDate: string;
  dueDate: string;
  items: LineItem[];
  taxRate: number;
  discount: number;
  notes: string;
  payments: Payment[];
}

/** The invoice as the client sees it. Re-renders on every keystroke in the editor and is what prints. */
export function InvoicePaper(p: PaperProps) {
  const t = invoiceTotals(p.items, p.taxRate, p.discount);
  const paid = p.payments.reduce((s, x) => s + x.amount, 0);
  const m = (v: number) => formatMoney(v, p.currency);
  const stamp = p.status === "paid" || p.status === "void" || p.status === "overdue" ? STATUS_LABEL[p.status] : null;

  return (
    <article className="paper" aria-label={`Invoice ${p.number} preview`}>
      {stamp && <div className={`stamp stamp-${p.status}`}>{stamp}</div>}
      <header className="paper-head">
        <div>
          <div className="paper-brand">
            <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
              <rect width="32" height="32" rx="9" fill="#059669" />
              <path d="M9 9v14h14" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M13 19l4-4 3 3 4-6" fill="none" stroke="#a7f3d0" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <strong>Saqib Digital Studio</strong>
          </div>
          <p className="paper-small">
            Gulberg III, Lahore, Pakistan
            <br />
            billing@saqib.studio · NTN 1234567-8
          </p>
        </div>
        <div className="paper-title">
          <h2>Invoice</h2>
          <p className="paper-number">{p.number}</p>
        </div>
      </header>

      <section className="paper-meta">
        <div>
          <p className="paper-label">Billed to</p>
          {p.client ? (
            <>
              <p className="paper-strong">{p.client.company || p.client.name}</p>
              <p className="paper-small">
                {p.client.name}
                <br />
                {p.client.email}
                {p.client.country && (
                  <>
                    <br />
                    {p.client.country}
                  </>
                )}
              </p>
            </>
          ) : (
            <p className="paper-small paper-placeholder">Choose a client</p>
          )}
        </div>
        <dl className="paper-dates">
          <dt>Issued</dt>
          <dd>{fmtDate(p.issueDate)}</dd>
          <dt>Due</dt>
          <dd>{fmtDate(p.dueDate)}</dd>
          <dt>Currency</dt>
          <dd>{p.currency}</dd>
        </dl>
      </section>

      <table className="paper-items">
        <thead>
          <tr>
            <th>Description</th>
            <th className="right">Qty</th>
            <th className="right">Rate</th>
            <th className="right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {p.items.map((it) => (
            <tr key={it.id}>
              <td>{it.description || <span className="paper-placeholder">Item description</span>}</td>
              <td className="right num">{it.quantity}</td>
              <td className="right num">{m(it.unitPrice)}</td>
              <td className="right num">{m(lineTotal(it))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="paper-totals">
        <dt>Subtotal</dt>
        <dd className="num">{m(t.subtotal)}</dd>
        {t.discount > 0 && (
          <>
            <dt>Discount</dt>
            <dd className="num">−{m(t.discount)}</dd>
          </>
        )}
        <dt>Tax ({p.taxRate}%)</dt>
        <dd className="num">{m(t.tax)}</dd>
        <dt className="paper-total">Total</dt>
        <dd className="paper-total num">{m(t.total)}</dd>
        {paid > 0 && (
          <>
            <dt>Paid</dt>
            <dd className="num">−{m(paid)}</dd>
            <dt className="paper-strong">Balance due</dt>
            <dd className="paper-strong num">{m(Math.max(0, t.total - paid))}</dd>
          </>
        )}
      </dl>

      <footer className="paper-foot">
        {p.notes && <p>{p.notes}</p>}
        <p className="paper-small">
          Bank transfer · Meezan Bank · IBAN PK00 MEZN 0000 0000 0000 0000 · Reference {p.number}
        </p>
      </footer>
    </article>
  );
}
