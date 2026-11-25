import { useMemo, useState } from "react";
import { LuPlus, LuTrash2 } from "react-icons/lu";
import { convert, CURRENCIES, EXPENSE_CATEGORIES, ExpenseInput, toMinor, type Currency, type ExpenseCategory } from "@ledgerly/shared";
import { Dialog, Empty, Field, Money } from "../components/ui";
import { cx, fmtDate, todayISO } from "../lib/format";
import { actions, useStore } from "../store";

const label = (c: string) => c[0].toUpperCase() + c.slice(1);

export function Expenses() {
  const { expenses, base } = useStore((s) => s);
  const [category, setCategory] = useState<ExpenseCategory | "all">("all");
  const [adding, setAdding] = useState(false);

  const byCategory = useMemo(() => {
    const totals = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c, 0])) as Record<ExpenseCategory, number>;
    for (const e of expenses) totals[e.category] += convert(e.amount, e.currency, base);
    return EXPENSE_CATEGORIES.map((c) => ({ c, total: totals[c] }))
      .filter((x) => x.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [expenses, base]);
  const grand = byCategory.reduce((s, x) => s + x.total, 0);
  const rows = expenses.filter((e) => category === "all" || e.category === category);

  return (
    <div className="stack-page">
      <section className="panel">
        <header className="panel-head">
          <div>
            <h2>Spending by category</h2>
            <p className="muted small">
              <Money minor={grand} currency={base} /> across all recorded expenses, in {base}
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => setAdding(true)}>
            <LuPlus /> Add expense
          </button>
        </header>
        <div className="split-bar" role="img" aria-label={byCategory.map((x) => `${label(x.c)} ${Math.round((x.total / grand) * 100)}%`).join(", ")}>
          {byCategory.map((x, i) => (
            <span key={x.c} className={`cat-${i}`} style={{ flex: x.total }} title={`${label(x.c)}: ${Math.round((x.total / grand) * 100)}%`} />
          ))}
        </div>
        <div className="cat-chips" role="group" aria-label="Filter by category">
          <button className={cx("chip", category === "all" && "on")} onClick={() => setCategory("all")}>
            All
          </button>
          {byCategory.map((x, i) => (
            <button key={x.c} className={cx("chip", category === x.c && "on")} onClick={() => setCategory(x.c)}>
              <i className={`dot cat-${i}`} /> {label(x.c)} <span className="muted">{Math.round((x.total / grand) * 100)}%</span>
            </button>
          ))}
        </div>
      </section>

      {rows.length === 0 ? (
        <Empty title="No expenses here yet" />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Vendor</th>
                <th>Category</th>
                <th className="right">Amount</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="static">
                  <td>{fmtDate(e.date)}</td>
                  <td className="strong">{e.vendor}</td>
                  <td>
                    <span className="tag">{label(e.category)}</span>
                  </td>
                  <td className="right">
                    <Money minor={e.amount} currency={e.currency} />
                  </td>
                  <td className="right">
                    <button className="icon-btn subtle-row" aria-label={`Delete ${e.vendor} expense`} onClick={() => void actions.deleteExpense(e.id).catch(() => undefined)}>
                      <LuTrash2 />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {adding && <ExpenseDialog onClose={() => setAdding(false)} />}
    </div>
  );
}

function ExpenseDialog({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ date: todayISO(), vendor: "", category: "software" as ExpenseCategory, amount: "", currency: "USD" as Currency });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit() {
    const input = { ...form, amount: toMinor(form.amount) };
    const parsed = ExpenseInput.safeParse(input);
    if (!parsed.success) return setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
    setBusy(true);
    try {
      await actions.addExpense(input);
      onClose();
    } catch {
      setBusy(false);
    }
  }

  return (
    <Dialog
      title="Add expense"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy} onClick={() => void submit()}>
            {busy ? "Saving…" : "Add expense"}
          </button>
        </>
      }
    >
      <div className="field-grid">
        <Field label="Vendor" error={errors.vendor}>
          <input value={form.vendor} aria-invalid={!!errors.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} placeholder="e.g. Figma" />
        </Field>
        <Field label="Date">
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </Field>
        <Field label="Amount" error={errors.amount}>
          <input value={form.amount} inputMode="decimal" placeholder="0.00" aria-invalid={!!errors.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} onKeyDown={(e) => e.key === "Enter" && void submit()} />
        </Field>
        <Field label="Currency">
          <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value as Currency })}>
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Category">
        <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCategory })}>
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {label(c)}
            </option>
          ))}
        </select>
      </Field>
    </Dialog>
  );
}
