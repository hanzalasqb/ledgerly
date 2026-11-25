import { useEffect, useMemo, useState } from "react";
import { LuArrowLeft, LuCopy, LuGripVertical, LuPlus, LuPrinter, LuSave, LuSend, LuTrash2, LuWallet, LuX } from "react-icons/lu";
import {
  CURRENCIES,
  displayStatus,
  dueOf,
  formatMoney,
  InvoiceInput,
  invoiceTotals,
  isEditable,
  lineTotal,
  PAYMENT_METHODS,
  toMajor,
  toMinor,
  type Currency,
  type Invoice,
  type LineItem,
} from "@ledgerly/shared";
import { InvoicePaper } from "../components/InvoicePaper";
import { Dialog, Field, Kbd, Money, StatusPill } from "../components/ui";
import { useHotkeys } from "../hooks/useHotkeys";
import { addDaysISO, cx, fmtDate, todayISO } from "../lib/format";
import { go } from "../lib/router";
import { actions, toast, useStore } from "../store";

/** Editable line: money is kept as text while typing and converted to minor units on the way out. */
type Line = { id: string; description: string; quantity: string; price: string };
type Form = { clientId: string; currency: Currency; issueDate: string; dueDate: string; lines: Line[]; taxRate: string; discount: string; notes: string };

const lid = () => Math.random().toString(36).slice(2, 10);
const TERMS = [7, 14, 30, 45];

function fromInvoice(inv: Invoice): Form {
  return {
    clientId: inv.clientId,
    currency: inv.currency,
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    lines: inv.items.map((i) => ({ id: i.id, description: i.description, quantity: String(i.quantity), price: toMajor(i.unitPrice).toFixed(2) })),
    taxRate: String(inv.taxRate),
    discount: inv.discount ? toMajor(inv.discount).toFixed(2) : "",
    notes: inv.notes,
  };
}

function blank(): Form {
  const today = todayISO();
  return { clientId: "", currency: "USD", issueDate: today, dueDate: addDaysISO(today, 14), lines: [{ id: lid(), description: "", quantity: "1", price: "" }], taxRate: "0", discount: "", notes: "Thank you for your business. Payment by bank transfer within the due date, please." };
}

const toItems = (lines: Line[]): LineItem[] => lines.map((l) => ({ id: l.id, description: l.description, quantity: Number(l.quantity) || 0, unitPrice: toMinor(l.price) }));

export function InvoiceEditor({ id }: { id: string }) {
  const { invoices, clients } = useStore((s) => s);
  const invoice = id === "new" ? undefined : invoices.find((i) => i.id === id);
  const editable = !invoice || isEditable(invoice);
  const [form, setForm] = useState<Form>(() => (invoice ? fromInvoice(invoice) : blank()));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [paying, setPaying] = useState(false);
  const [confirm, setConfirm] = useState<"delete" | "void" | null>(null);
  const today = todayISO();

  useEffect(() => {
    if (invoice) setForm(fromInvoice(invoice));
    setDirty(false);
    setErrors({});
    // reset only when navigating to a different invoice or after a save changes its status
  }, [invoice?.id, invoice?.status]);

  const update = (patch: Partial<Form>) => {
    setForm((f) => ({ ...f, ...patch }));
    setDirty(true);
    if (Object.keys(errors).length) setErrors({});
  };
  const updateLine = (lineId: string, patch: Partial<Line>) => update({ lines: form.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)) });

  const items = useMemo(() => toItems(form.lines), [form.lines]);
  const totals = invoiceTotals(items, Number(form.taxRate) || 0, toMinor(form.discount || 0));
  const client = clients.find((c) => c.id === form.clientId);
  const status = invoice ? displayStatus(invoice, today) : "draft";

  const input = (): InvoiceInput => ({ clientId: form.clientId, currency: form.currency, issueDate: form.issueDate, dueDate: form.dueDate, items, taxRate: Number(form.taxRate), discount: toMinor(form.discount || 0), notes: form.notes });

  async function save(): Promise<Invoice | null> {
    const parsed = InvoiceInput.safeParse(input());
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])));
      toast("Check the highlighted fields", "error");
      return null;
    }
    setErrors({});
    setSaving(true);
    try {
      const saved = await actions.saveInvoice(input(), invoice?.id);
      setDirty(false);
      if (!invoice) go(`/invoices/${saved.id}`);
      return saved;
    } catch {
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function send() {
    const saved = dirty || !invoice ? await save() : invoice;
    if (saved) await actions.sendInvoice(saved.id).catch(() => undefined);
  }

  const print = () => {
    try {
      window.print();
    } catch {
      toast("Printing isn't available here. Open the live site to save a PDF.", "info");
    }
  };

  useHotkeys({ "mod+s": () => editable && void save() });

  if (id !== "new" && !invoice) {
    return (
      <div className="empty">
        <h3>Invoice not found</h3>
        <a className="btn" href="#/invoices">
          Back to invoices
        </a>
      </div>
    );
  }

  const err = (k: string) => errors[k];

  return (
    <div className="editor">
      <header className="editor-head">
        <a className="back" href="#/invoices" aria-label="Back to invoices">
          <LuArrowLeft />
        </a>
        <div className="editor-title">
          <h2>{invoice?.number ?? "New invoice"}</h2>
          <StatusPill status={status} />
          {dirty && <span className="muted small">Unsaved changes</span>}
        </div>
        <div className="editor-actions">
          {confirm ? (
            <span className="confirm">
              {confirm === "delete" ? "Delete this draft?" : "Void this invoice? This can't be undone."}
              <button className="btn btn-danger btn-sm" onClick={async () => (confirm === "delete" ? (await actions.deleteInvoice(invoice!.id).catch(() => undefined), go("/invoices")) : await actions.voidInvoice(invoice!.id).catch(() => undefined), setConfirm(null))}>
                {confirm === "delete" ? "Delete" : "Void"}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirm(null)}>
                Cancel
              </button>
            </span>
          ) : (
            <>
              {invoice?.status === "draft" && (
                <button className="icon-btn danger" title="Delete draft" aria-label="Delete draft" onClick={() => setConfirm("delete")}>
                  <LuTrash2 />
                </button>
              )}
              {invoice?.status === "sent" && (
                <button className="btn btn-ghost" onClick={() => setConfirm("void")}>
                  <LuX /> Void
                </button>
              )}
              {invoice && (
                <button className="btn btn-ghost" onClick={async () => go(`/invoices/${(await actions.duplicateInvoice(invoice.id)).id}`)}>
                  <LuCopy /> Duplicate
                </button>
              )}
              {invoice && (
                <button className="btn btn-ghost hide-sm" onClick={print}>
                  <LuPrinter /> Print / PDF
                </button>
              )}
              {editable && (
                <button className="btn" onClick={() => void save()} disabled={saving} title="Save (Ctrl/⌘ S)">
                  <LuSave /> {saving ? "Saving…" : "Save draft"}
                </button>
              )}
              {editable && (
                <button className="btn btn-primary" onClick={() => void send()} disabled={saving}>
                  <LuSend /> Mark as sent
                </button>
              )}
              {invoice?.status === "sent" && (
                <button className="btn btn-primary" onClick={() => setPaying(true)}>
                  <LuWallet /> Record payment
                </button>
              )}
            </>
          )}
        </div>
      </header>

      <div className="editor-grid">
        <div className="editor-form">
          {editable ? (
            <>
              <section className="panel form-panel">
                <div className="field-grid">
                  <Field label="Client" error={err("clientId")}>
                    <select
                      value={form.clientId}
                      aria-invalid={!!err("clientId")}
                      onChange={(e) => {
                        const c = clients.find((x) => x.id === e.target.value);
                        update({ clientId: e.target.value, ...(c ? { currency: c.currency } : {}) });
                      }}
                    >
                      <option value="">Choose a client…</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.company || c.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Currency">
                    <select value={form.currency} onChange={(e) => update({ currency: e.target.value as Currency })}>
                      {CURRENCIES.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Issue date" error={err("issueDate")}>
                    <input type="date" value={form.issueDate} onChange={(e) => update({ issueDate: e.target.value })} />
                  </Field>
                  <Field label="Due date" error={err("dueDate")}>
                    <input type="date" value={form.dueDate} aria-invalid={!!err("dueDate")} onChange={(e) => update({ dueDate: e.target.value })} />
                  </Field>
                </div>
                <div className="terms" role="group" aria-label="Payment terms">
                  <span className="muted small">Terms</span>
                  {TERMS.map((d) => (
                    <button key={d} type="button" className={cx("chip", form.dueDate === addDaysISO(form.issueDate, d) && "on")} onClick={() => update({ dueDate: addDaysISO(form.issueDate, d) })}>
                      Net {d}
                    </button>
                  ))}
                </div>
              </section>

              <section className="panel form-panel">
                <h3 className="form-title">Line items</h3>
                {err("items") && <p className="field-error">{err("items")}</p>}
                <div className="lines" role="table" aria-label="Line items">
                  <div className="line line-head" role="row">
                    <span />
                    <span role="columnheader">Description</span>
                    <span role="columnheader">Qty</span>
                    <span role="columnheader">Rate</span>
                    <span role="columnheader" className="right">
                      Amount
                    </span>
                    <span />
                  </div>
                  {form.lines.map((l, i) => (
                    <div className="line" role="row" key={l.id}>
                      <LuGripVertical className="grip" aria-hidden />
                      <input value={l.description} placeholder="e.g. Design sprint" aria-label={`Line ${i + 1} description`} aria-invalid={!!err(`items.${i}.description`)} onChange={(e) => updateLine(l.id, { description: e.target.value })} />
                      <input value={l.quantity} inputMode="decimal" aria-label={`Line ${i + 1} quantity`} aria-invalid={!!err(`items.${i}.quantity`)} onChange={(e) => updateLine(l.id, { quantity: e.target.value })} />
                      <input value={l.price} inputMode="decimal" placeholder="0.00" aria-label={`Line ${i + 1} rate`} onChange={(e) => updateLine(l.id, { price: e.target.value })} />
                      <span className="right num">{formatMoney(lineTotal(items[i]), form.currency)}</span>
                      <button type="button" className="icon-btn subtle" aria-label={`Remove line ${i + 1}`} disabled={form.lines.length === 1} onClick={() => update({ lines: form.lines.filter((x) => x.id !== l.id) })}>
                        <LuX />
                      </button>
                    </div>
                  ))}
                </div>
                <button type="button" className="btn btn-ghost btn-sm add-line" onClick={() => update({ lines: [...form.lines, { id: lid(), description: "", quantity: "1", price: "" }] })}>
                  <LuPlus /> Add line
                </button>

                <div className="totals-edit">
                  <Field label="Tax rate (%)" error={err("taxRate")}>
                    <input value={form.taxRate} inputMode="decimal" onChange={(e) => update({ taxRate: e.target.value })} />
                  </Field>
                  <Field label={`Discount (${form.currency})`}>
                    <input value={form.discount} inputMode="decimal" placeholder="0.00" onChange={(e) => update({ discount: e.target.value })} />
                  </Field>
                  <dl className="mini-totals">
                    <dt>Subtotal</dt>
                    <dd className="num">{formatMoney(totals.subtotal, form.currency)}</dd>
                    <dt>Tax</dt>
                    <dd className="num">{formatMoney(totals.tax, form.currency)}</dd>
                    <dt className="strong">Total</dt>
                    <dd className="strong num">{formatMoney(totals.total, form.currency)}</dd>
                  </dl>
                </div>
              </section>

              <section className="panel form-panel">
                <Field label="Notes to client">
                  <textarea rows={3} value={form.notes} onChange={(e) => update({ notes: e.target.value })} />
                </Field>
                <p className="muted small">
                  <Kbd>Ctrl</Kbd>/<Kbd>⌘</Kbd> + <Kbd>S</Kbd> saves the draft. Sent invoices are locked; void and duplicate to make changes.
                </p>
              </section>
            </>
          ) : (
            invoice && <Summary invoice={invoice} />
          )}
        </div>

        <div className="editor-preview">
          <InvoicePaper number={invoice?.number ?? "Draft"} status={status} client={client} currency={form.currency} issueDate={form.issueDate} dueDate={form.dueDate} items={items} taxRate={Number(form.taxRate) || 0} discount={toMinor(form.discount || 0)} notes={form.notes} payments={invoice?.payments ?? []} />
        </div>
      </div>

      {paying && invoice && <PaymentDialog invoice={invoice} onClose={() => setPaying(false)} />}
    </div>
  );
}

function Summary({ invoice }: { invoice: Invoice }) {
  const due = dueOf(invoice);
  const t = invoiceTotals(invoice.items, invoice.taxRate, invoice.discount);
  return (
    <section className="panel form-panel">
      <h3 className="form-title">Summary</h3>
      <dl className="summary">
        <dt>Total</dt>
        <dd>
          <Money minor={t.total} currency={invoice.currency} />
        </dd>
        <dt>Paid</dt>
        <dd>
          <Money minor={t.total - due} currency={invoice.currency} />
        </dd>
        <dt>Balance due</dt>
        <dd className="strong">
          <Money minor={invoice.status === "void" ? 0 : due} currency={invoice.currency} />
        </dd>
        {invoice.sentAt && (
          <>
            <dt>Sent</dt>
            <dd>{fmtDate(invoice.sentAt)}</dd>
          </>
        )}
      </dl>
      <h3 className="form-title mt">Payments</h3>
      {invoice.payments.length === 0 ? (
        <p className="muted small">No payments yet.</p>
      ) : (
        <ul className="payments">
          {invoice.payments.map((p) => (
            <li key={p.id}>
              <span>
                {fmtDate(p.date)} · {p.method.replace("_", " ")}
              </span>
              <Money minor={p.amount} currency={invoice.currency} />
            </li>
          ))}
        </ul>
      )}
      <p className="muted small mt">{invoice.status === "void" ? "This invoice was voided and no longer counts towards revenue." : "Sent invoices are locked to keep a reliable audit trail. Duplicate it to bill again."}</p>
    </section>
  );
}

function PaymentDialog({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const due = dueOf(invoice);
  const [amount, setAmount] = useState(toMajor(due).toFixed(2));
  const [date, setDate] = useState(todayISO());
  const [method, setMethod] = useState<(typeof PAYMENT_METHODS)[number]>("bank_transfer");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const minor = toMinor(amount);
    if (minor <= 0) return setError("Enter an amount above zero");
    if (minor > due) return setError(`That's more than the ${formatMoney(due, invoice.currency)} due`);
    setBusy(true);
    try {
      await actions.recordPayment(invoice.id, { amount: minor, date, method });
      onClose();
    } catch {
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={`Record payment · ${invoice.number}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => void submit()} disabled={busy}>
            {busy ? "Saving…" : "Record payment"}
          </button>
        </>
      }
    >
      <p className="muted small">
        Balance due: <strong>{formatMoney(due, invoice.currency)}</strong>. A payment for the full balance marks the invoice as paid.
      </p>
      <div className="field-grid">
        <Field label={`Amount (${invoice.currency})`} error={error}>
          <input value={amount} inputMode="decimal" aria-invalid={!!error} onChange={(e) => (setAmount(e.target.value), setError(""))} onKeyDown={(e) => e.key === "Enter" && void submit()} />
        </Field>
        <Field label="Date">
          <input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Field label="Method">
        <select value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {m.replace("_", " ").replace(/^\w/, (c) => c.toUpperCase())}
            </option>
          ))}
        </select>
      </Field>
    </Dialog>
  );
}
