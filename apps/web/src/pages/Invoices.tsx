import { useMemo, useState } from "react";
import { LuArrowUpDown, LuPlus, LuSearch } from "react-icons/lu";
import { displayStatus, dueOf, totalsOf, type DisplayStatus, type Invoice } from "@ledgerly/shared";
import { ClientMark, Empty, Money, StatusPill } from "../components/ui";
import { cx, fmtDate, relativeDue, todayISO } from "../lib/format";
import { go } from "../lib/router";
import { useStore } from "../store";

const TABS: { key: string; label: string; match: (s: DisplayStatus) => boolean }[] = [
  { key: "all", label: "All", match: () => true },
  { key: "draft", label: "Drafts", match: (s) => s === "draft" },
  { key: "open", label: "Open", match: (s) => s === "sent" || s === "partial" || s === "overdue" },
  { key: "overdue", label: "Overdue", match: (s) => s === "overdue" },
  { key: "paid", label: "Paid", match: (s) => s === "paid" },
  { key: "void", label: "Void", match: (s) => s === "void" },
];

type SortKey = "issueDate" | "dueDate" | "total";

export function Invoices({ filter }: { filter: string | null }) {
  const { invoices, clients } = useStore((s) => s);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "issueDate", dir: -1 });
  const today = todayISO();
  const tab = TABS.find((t) => t.key === filter) ?? TABS[0];
  const byId = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const value = (i: Invoice) => (sort.key === "total" ? totalsOf(i).total : i[sort.key]);
    return invoices
      .map((inv) => ({ inv, status: displayStatus(inv, today), client: byId.get(inv.clientId) }))
      .filter((r) => tab.match(r.status))
      .filter((r) => !q || `${r.inv.number} ${r.client?.company} ${r.client?.name}`.toLowerCase().includes(q))
      .sort((a, b) => {
        const va = value(a.inv);
        const vb = value(b.inv);
        return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
      });
  }, [invoices, byId, query, sort, tab, today]);

  const counts = Object.fromEntries(TABS.map((t) => [t.key, invoices.filter((i) => t.match(displayStatus(i, today))).length]));
  const toggle = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : -1 }));
  const SortBtn = ({ k, children }: { k: SortKey; children: string }) => (
    <button className={cx("th-sort", sort.key === k && "th-active")} onClick={() => toggle(k)}>
      {children} <LuArrowUpDown />
    </button>
  );

  return (
    <div className="stack-page">
      <div className="toolbar">
        <nav className="tabs" aria-label="Filter invoices by status">
          {TABS.map((t) => (
            <a key={t.key} href={t.key === "all" ? "#/invoices" : `#/invoices?status=${t.key}`} className={cx("tab", t.key === tab.key && "active")} aria-current={t.key === tab.key ? "page" : undefined}>
              {t.label} <span className="tab-count">{counts[t.key]}</span>
            </a>
          ))}
        </nav>
        <label className="search">
          <LuSearch />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search number or client" aria-label="Search invoices" />
        </label>
        <button className="btn btn-primary" onClick={() => go("/invoices/new")}>
          <LuPlus /> New invoice
        </button>
      </div>

      {rows.length === 0 ? (
        <Empty title={query ? "No matching invoices" : `No ${tab.label.toLowerCase()} invoices`} action={<button className="btn btn-primary" onClick={() => go("/invoices/new")}>Create an invoice</button>}>
          {query ? "Try a different number or client name." : "Invoices you create will show up here."}
        </Empty>
      ) : (
        <div className="table-wrap">
          <table className="table inv-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Client</th>
                <th className="hide-sm">
                  <SortBtn k="issueDate">Issued</SortBtn>
                </th>
                <th>
                  <SortBtn k="dueDate">Due</SortBtn>
                </th>
                <th>Status</th>
                <th className="right">
                  <SortBtn k="total">Amount</SortBtn>
                </th>
                <th className="right hide-sm">Balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ inv, status, client }) => (
                <tr key={inv.id} tabIndex={0} onClick={() => go(`/invoices/${inv.id}`)} onKeyDown={(e) => e.key === "Enter" && go(`/invoices/${inv.id}`)}>
                  <td className="mono c-num">{inv.number}</td>
                  <td className="c-client">
                    <span className="client-cell">
                      <ClientMark client={client} size={26} />
                      <span>
                        {client?.company || client?.name}
                        <small className="muted">{client?.name}</small>
                      </span>
                    </span>
                  </td>
                  <td className="hide-sm c-issued">{fmtDate(inv.issueDate)}</td>
                  <td className="c-due">
                    {fmtDate(inv.dueDate)}
                    {(status === "overdue" || status === "sent" || status === "partial") && <small className={cx("due-note", status === "overdue" && "danger")}>{relativeDue(inv.dueDate, today)}</small>}
                  </td>
                  <td className="c-status">
                    <StatusPill status={status} />
                  </td>
                  <td className="right c-amount">
                    <Money minor={totalsOf(inv).total} currency={inv.currency} />
                  </td>
                  <td className="right hide-sm">{inv.status === "sent" ? <Money minor={dueOf(inv)} currency={inv.currency} /> : <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
