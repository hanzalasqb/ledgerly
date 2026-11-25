import { useEffect, useRef, type ReactNode } from "react";
import { LuX } from "react-icons/lu";
import { formatMoney, STATUS_LABEL, type Client, type Currency, type DisplayStatus } from "@ledgerly/shared";
import { cx, initials } from "../lib/format";

export function StatusPill({ status }: { status: DisplayStatus }) {
  return (
    <span className={cx("pill", `pill-${status}`)}>
      <span className="pill-dot" />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function ClientMark({ client, size = 32 }: { client?: Client; size?: number }) {
  return (
    <span className="client-mark" style={{ width: size, height: size, background: client?.color ?? "var(--color-surface-3)", fontSize: size * 0.38 }} aria-hidden>
      {client ? initials(client.company || client.name) : "?"}
    </span>
  );
}

export const Money = ({ minor, currency, compact }: { minor: number; currency: Currency; compact?: boolean }) => <span className="num">{formatMoney(minor, currency, { compact })}</span>;

/** Accessible modal: focus moves in on open, Escape and backdrop click close it, focus returns on close. */
export function Dialog({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("input, select, textarea, button")?.focus();
    return () => prev?.focus?.();
  }, []);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={cx("dialog", wide && "dialog-wide")} role="dialog" aria-modal="true" aria-label={title} onKeyDown={(e) => e.key === "Escape" && onClose()}>
        <header className="dialog-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <LuX />
          </button>
        </header>
        <div className="dialog-body">{children}</div>
        {footer && <footer className="dialog-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function Field({ label, error, children, hint }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {error ? <small className="field-error">{error}</small> : hint ? <small className="muted">{hint}</small> : null}
    </label>
  );
}

export const Kbd = ({ children }: { children: ReactNode }) => <kbd className="kbd">{children}</kbd>;

export function Logo() {
  return (
    <span className="logo">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="9" fill="#059669" />
        <path d="M9 9v14h14" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13 19l4-4 3 3 4-6" fill="none" stroke="#a7f3d0" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="logo-text">Ledgerly</span>
    </span>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p className="muted">{children}</p>}
      {action}
    </div>
  );
}
