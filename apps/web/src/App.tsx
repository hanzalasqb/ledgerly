import { useEffect, type ReactNode } from "react";
import { LuFileText, LuGithub, LuLayoutDashboard, LuLogOut, LuMonitor, LuMoon, LuPalette, LuReceipt, LuRotateCcw, LuSun, LuUsers } from "react-icons/lu";
import { CURRENCIES, type Currency } from "@ledgerly/shared";
import { client, IS_DEMO } from "./api";
import { Logo } from "./components/ui";
import { useHotkeys } from "./hooks/useHotkeys";
import { useTheme } from "./hooks/useTheme";
import { cx, initials } from "./lib/format";
import { go, useRoute, type Route } from "./lib/router";
import { Clients } from "./pages/Clients";
import { Dashboard } from "./pages/Dashboard";
import { DesignSystem } from "./pages/DesignSystem";
import { Expenses } from "./pages/Expenses";
import { InvoiceEditor } from "./pages/InvoiceEditor";
import { Invoices } from "./pages/Invoices";
import { Login } from "./pages/Login";
import { actions, useStore } from "./store";

const NAV: { page: Route["page"]; href: string; label: string; icon: ReactNode }[] = [
  { page: "dashboard", href: "#/", label: "Dashboard", icon: <LuLayoutDashboard /> },
  { page: "invoices", href: "#/invoices", label: "Invoices", icon: <LuFileText /> },
  { page: "clients", href: "#/clients", label: "Clients", icon: <LuUsers /> },
  { page: "expenses", href: "#/expenses", label: "Expenses", icon: <LuReceipt /> },
  { page: "design", href: "#/design", label: "Design system", icon: <LuPalette /> },
];

const TITLES: Record<Route["page"], [string, string]> = {
  dashboard: ["Overview", "Cash flow, receivables and who owes you what"],
  invoices: ["Invoices", "Create, send and track every invoice"],
  invoice: ["Invoice", ""],
  clients: ["Clients", "The people and companies you bill"],
  expenses: ["Expenses", "What it costs to run the business"],
  design: ["Design system", "Tokens and components, synced with Figma"],
};

export function App() {
  const phase = useStore((s) => s.phase);
  useEffect(() => {
    if (phase === "loading") void actions.load();
  }, [phase]);
  if (phase === "signed-out") return <Login />;
  if (phase === "error") return <ErrorState />;
  if (phase === "loading") return <Loading />;
  return <Shell />;
}

function Shell() {
  const route = useRoute();
  const { user, base, toasts } = useStore((s) => s);
  const theme = useTheme();
  const ThemeIcon = theme.pref === "dark" ? LuMoon : theme.pref === "light" ? LuSun : LuMonitor;
  const active = route.page === "invoice" ? "invoices" : route.page;
  const [title, subtitle] = TITLES[route.page];

  useHotkeys({ n: () => go("/invoices/new") });
  useEffect(() => {
    document.title = `${title} · Ledgerly`;
  }, [title]);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-top">
          <Logo />
          <nav aria-label="Main">
            {NAV.map((n) => (
              <a key={n.page} href={n.href} className={cx("nav-item", active === n.page && "active")} aria-current={active === n.page ? "page" : undefined}>
                {n.icon}
                <span>{n.label}</span>
              </a>
            ))}
          </nav>
        </div>
        <div className="sidebar-bottom">
          <label className="base-select">
            <span>Reporting currency</span>
            <select value={base} onChange={(e) => actions.setBase(e.target.value as Currency)}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <div className="me">
            <span className="avatar">{initials(user?.name ?? "?")}</span>
            <span className="me-name">
              {user?.name}
              <small>{user?.email}</small>
            </span>
            <button className="icon-btn" onClick={theme.cycle} aria-label={`Theme: ${theme.pref}`} title={`Theme: ${theme.pref}`}>
              <ThemeIcon />
            </button>
            {!IS_DEMO && (
              <button className="icon-btn" onClick={actions.signOut} aria-label="Sign out" title="Sign out">
                <LuLogOut />
              </button>
            )}
          </div>
        </div>
      </aside>

      <main className="main">
        {IS_DEMO && (
          <div className="demo-bar">
            <span>
              <strong>Live demo</strong> · sample books for a fictional studio. Everything runs in your browser and saves on this device.
            </span>
            <span className="demo-links">
              <a href="https://github.com/hanzalasqb/ledgerly" target="_blank" rel="noreferrer">
                <LuGithub /> Source
              </a>
              <button className="link-btn" onClick={() => client.logout()}>
                <LuRotateCcw /> Reset data
              </button>
            </span>
          </div>
        )}
        {route.page !== "invoice" && (
          <header className="topbar">
            <h1>{title}</h1>
            <p className="muted">{subtitle}</p>
          </header>
        )}
        <div className="content">
          {route.page === "dashboard" && <Dashboard />}
          {route.page === "invoices" && <Invoices filter={route.filter} />}
          {route.page === "invoice" && <InvoiceEditor key={route.id} id={route.id} />}
          {route.page === "clients" && <Clients />}
          {route.page === "expenses" && <Expenses />}
          {route.page === "design" && <DesignSystem />}
        </div>
      </main>

      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={cx("toast", `toast-${t.tone}`)}>
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div className="center-screen" aria-busy="true">
      <Logo />
      <span className="spinner" aria-label="Loading your books" />
    </div>
  );
}

function ErrorState() {
  const error = useStore((s) => s.error);
  return (
    <div className="center-screen">
      <Logo />
      <p>{error}</p>
      <button className="btn btn-primary" onClick={() => actions.load()}>
        Try again
      </button>
    </div>
  );
}
