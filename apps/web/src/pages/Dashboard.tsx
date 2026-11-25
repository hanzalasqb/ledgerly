import { useMemo, type ReactNode } from "react";
import { LuArrowDownRight, LuArrowUpRight, LuClock, LuPlus, LuTriangleAlert, LuWallet } from "react-icons/lu";
import { cashFlow, displayStatus, summarize, topClients, totalsOf } from "@ledgerly/shared";
import { CashFlowChart } from "../charts/CashFlowChart";
import { ClientMark, Money, StatusPill } from "../components/ui";
import { cx, fmtDate, todayISO } from "../lib/format";
import { go } from "../lib/router";
import { useStore } from "../store";

export function Dashboard() {
  const { invoices, expenses, clients, base } = useStore((s) => s);
  const today = todayISO();
  const byId = new Map(clients.map((c) => [c.id, c]));

  const { summary, flow, top } = useMemo(
    () => ({ summary: summarize(invoices, base, today), flow: cashFlow(invoices, expenses, base, today), top: topClients(invoices, base) }),
    [invoices, expenses, base, today],
  );
  const yearRevenue = flow.reduce((s, p) => s + p.revenue, 0);
  const yearExpenses = flow.reduce((s, p) => s + p.expenses, 0);
  const margin = yearRevenue ? Math.round(((yearRevenue - yearExpenses) / yearRevenue) * 100) : 0;
  const agingMax = Math.max(1, ...summary.aging.map((a) => a.amount));
  const attention = invoices
    .filter((i) => ["overdue", "sent", "partial"].includes(displayStatus(i, today)))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 5);

  return (
    <div className="dash">
      <section className="kpis" aria-label="Key figures">
        <Kpi
          label="Collected this month"
          value={<Money minor={summary.revenueThisMonth} currency={base} />}
          icon={<LuWallet />}
          delta={summary.revenueChange}
          sub={`vs ${new Intl.NumberFormat("en-US", { style: "currency", currency: base, notation: "compact" }).format(summary.revenueLastMonth / 100)} last month`}
        />
        <Kpi label="Outstanding" value={<Money minor={summary.outstanding} currency={base} />} icon={<LuClock />} sub={`${summary.outstandingCount} open invoice${summary.outstandingCount === 1 ? "" : "s"}`} />
        <Kpi label="Overdue" value={<Money minor={summary.overdue} currency={base} />} icon={<LuTriangleAlert />} tone={summary.overdue ? "danger" : undefined} sub={`${summary.overdueCount} past due date`} />
        <Kpi label="Avg. days to get paid" value={summary.avgDaysToPay ?? "—"} icon={<LuArrowDownRight />} sub="From issue date to final payment" />
      </section>

      <section className="panel chart-panel">
        <header className="panel-head">
          <div>
            <h2>Cash flow</h2>
            <p className="muted small">
              Last 12 months · <Money minor={yearRevenue} currency={base} compact /> in, <Money minor={yearExpenses} currency={base} compact /> out · {margin}% margin
            </p>
          </div>
          <ul className="legend">
            <li>
              <i className="sw sw-revenue" /> Revenue
            </li>
            <li>
              <i className="sw sw-expense" /> Expenses
            </li>
            <li>
              <i className="sw sw-net" /> Net
            </li>
          </ul>
        </header>
        <CashFlowChart data={flow} currency={base} />
      </section>

      <div className="dash-grid">
        <section className="panel">
          <header className="panel-head">
            <h2>Needs attention</h2>
            <a className="link" href="#/invoices?status=open">
              All open
            </a>
          </header>
          {attention.length === 0 ? (
            <p className="muted">Nothing outstanding. Nice.</p>
          ) : (
            <ul className="rows">
              {attention.map((inv) => {
                const c = byId.get(inv.clientId);
                return (
                  <li key={inv.id}>
                    <a href={`#/invoices/${inv.id}`} className="row-link">
                      <ClientMark client={c} size={32} />
                      <span className="row-main">
                        <strong>{c?.company || c?.name}</strong>
                        <span className="muted small">
                          {inv.number} · due {fmtDate(inv.dueDate, { day: "numeric", month: "short" })}
                        </span>
                      </span>
                      <StatusPill status={displayStatus(inv, today)} />
                      <Money minor={totalsOf(inv).total} currency={inv.currency} />
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="panel">
          <header className="panel-head">
            <h2>Receivables aging</h2>
          </header>
          <ul className="bars">
            {summary.aging.map((a, i) => (
              <li key={a.label}>
                <span className="bar-label">{a.label}</span>
                <span className="bar-track">
                  <span className={cx("bar-fill", `age-${i}`)} style={{ width: `${(a.amount / agingMax) * 100}%` }} />
                </span>
                <Money minor={a.amount} currency={base} compact />
              </li>
            ))}
          </ul>
          <header className="panel-head mt">
            <h2>Top clients</h2>
            <span className="muted small">Collected, 12 months</span>
          </header>
          <ul className="rows compact">
            {top.map(({ clientId, total }) => {
              const c = byId.get(clientId);
              return (
                <li key={clientId} className="row-static">
                  <ClientMark client={c} size={26} />
                  <span className="row-main">{c?.company || c?.name}</span>
                  <Money minor={total} currency={base} />
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <button className="fab btn btn-primary" onClick={() => go("/invoices/new")}>
        <LuPlus /> New invoice
      </button>
    </div>
  );
}

function Kpi({ label, value, icon, sub, delta, tone }: { label: string; value: ReactNode; icon: ReactNode; sub: string; delta?: number | null; tone?: "danger" }) {
  return (
    <div className={cx("kpi", tone && `kpi-${tone}`)}>
      <p className="kpi-label">
        <span className="kpi-icon">{icon}</span>
        {label}
      </p>
      <p className="kpi-value">{value}</p>
      <p className="kpi-sub">
        {delta != null && (
          <span className={cx("delta", delta >= 0 ? "up" : "down")}>
            {delta >= 0 ? <LuArrowUpRight /> : <LuArrowDownRight />}
            {Math.abs(delta)}%
          </span>
        )}
        {sub}
      </p>
    </div>
  );
}

