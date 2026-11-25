import { useState } from "react";
import { LuMail, LuPencil, LuPlus } from "react-icons/lu";
import { ClientInput, convert, CURRENCIES, displayStatus, dueOf, paidOf, type Client, type Currency } from "@ledgerly/shared";
import { ClientMark, Dialog, Empty, Field, Money } from "../components/ui";
import { todayISO } from "../lib/format";
import { actions, useStore } from "../store";

export function Clients() {
  const { clients, invoices, base } = useStore((s) => s);
  const [editing, setEditing] = useState<Client | "new" | null>(null);
  const today = todayISO();

  const stats = (c: Client) => {
    const mine = invoices.filter((i) => i.clientId === c.id && i.status !== "void");
    return {
      count: mine.length,
      billed: mine.reduce((s, i) => s + convert(paidOf(i), i.currency, base), 0),
      outstanding: mine.filter((i) => i.status === "sent").reduce((s, i) => s + convert(dueOf(i), i.currency, base), 0),
      overdue: mine.some((i) => displayStatus(i, today) === "overdue"),
    };
  };

  return (
    <div className="stack-page">
      <div className="toolbar">
        <p className="muted">
          {clients.length} clients · totals shown in {base}
        </p>
        <button className="btn btn-primary" onClick={() => setEditing("new")}>
          <LuPlus /> Add client
        </button>
      </div>

      {clients.length === 0 ? (
        <Empty title="No clients yet" action={<button className="btn btn-primary" onClick={() => setEditing("new")}>Add your first client</button>}>
          Add a client to start sending invoices.
        </Empty>
      ) : (
        <div className="client-grid">
          {clients.map((c) => {
            const s = stats(c);
            return (
              <article key={c.id} className="client-card">
                <header>
                  <ClientMark client={c} size={40} />
                  <div className="client-id">
                    <h3>{c.company || c.name}</h3>
                    <p className="muted small">
                      {c.name} · {c.country || "—"}
                    </p>
                  </div>
                  <button className="icon-btn" aria-label={`Edit ${c.company || c.name}`} onClick={() => setEditing(c)}>
                    <LuPencil />
                  </button>
                </header>
                <dl className="client-stats">
                  <div>
                    <dt>Collected</dt>
                    <dd>
                      <Money minor={s.billed} currency={base} compact />
                    </dd>
                  </div>
                  <div>
                    <dt>Outstanding</dt>
                    <dd className={s.overdue ? "danger" : undefined}>
                      <Money minor={s.outstanding} currency={base} compact />
                    </dd>
                  </div>
                  <div>
                    <dt>Invoices</dt>
                    <dd>{s.count}</dd>
                  </div>
                </dl>
                <footer>
                  <span className="currency-tag">{c.currency}</span>
                  <span className="muted small email">
                    <LuMail /> {c.email}
                  </span>
                </footer>
              </article>
            );
          })}
        </div>
      )}

      {editing && <ClientDialog client={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ClientDialog({ client, onClose }: { client?: Client; onClose: () => void }) {
  const [form, setForm] = useState({ name: client?.name ?? "", email: client?.email ?? "", company: client?.company ?? "", country: client?.country ?? "", currency: (client?.currency ?? "USD") as Currency });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    const parsed = ClientInput.safeParse(form);
    if (!parsed.success) return setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
    setBusy(true);
    try {
      await actions.saveClient(form, client?.id);
      onClose();
    } catch {
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={client ? "Edit client" : "Add client"}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy} onClick={() => void submit()}>
            {busy ? "Saving…" : client ? "Save changes" : "Add client"}
          </button>
        </>
      }
    >
      <form className="dialog-form" onSubmit={(e) => (e.preventDefault(), void submit())}>
        <div className="field-grid">
          <Field label="Contact name" error={errors.name}>
            <input value={form.name} aria-invalid={!!errors.name} onChange={(e) => set("name", e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Email" error={errors.email}>
            <input type="email" value={form.email} aria-invalid={!!errors.email} onChange={(e) => set("email", e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Company">
            <input value={form.company} onChange={(e) => set("company", e.target.value)} />
          </Field>
          <Field label="Country">
            <input value={form.country} onChange={(e) => set("country", e.target.value)} />
          </Field>
        </div>
        <Field label="Billing currency" hint="New invoices for this client default to this currency.">
          <select value={form.currency} onChange={(e) => set("currency", e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <button hidden />
      </form>
    </Dialog>
  );
}
