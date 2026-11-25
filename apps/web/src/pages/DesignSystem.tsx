import tokens from "../../../../design/tokens.json";
import { DEMO_CLIENTS, type Client } from "@ledgerly/shared";
import { ClientMark, Kbd, Money, StatusPill } from "../components/ui";

type Leaf = { $type: string; $value: string | number | number[] };
type Group = { [k: string]: Leaf | Group | string };
const leaves = (g: Group) => Object.entries(g).filter(([k, v]) => !k.startsWith("$") && typeof v === "object" && "$value" in v) as [string, Leaf][];
const SEMANTIC = leaves(tokens.theme.light as unknown as Group).map(([k]) => k);
const sample = { ...DEMO_CLIENTS[0], createdAt: "" } as Client;

/** Living style guide rendered from design/tokens.json — the file designers sync with Figma via Tokens Studio. */
export function DesignSystem() {
  return (
    <div className="stack-page">
      <p className="muted intro">
        Every color, size and radius here comes from <code>design/tokens.json</code> (W3C Design Tokens). Designers sync the same file with Figma through Tokens Studio, and <code>npm run tokens</code> regenerates the CSS variables, so design and code can't drift apart.
      </p>
      <section className="panel">
        <h2>Semantic colors</h2>
        <div className="swatches">
          {SEMANTIC.map((name) => (
            <figure key={name} className="swatch-card">
              <span className="swatch-color" style={{ background: `var(--color-${name})` }} />
              <figcaption>
                <code>--color-{name}</code>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>
      <div className="dash-grid">
        <section className="panel">
          <h2>Type scale</h2>
          {leaves(tokens.font.size as unknown as Group)
            .reverse()
            .map(([k, v]) => (
              <p key={k} className="type-row" style={{ fontSize: `var(--font-size-${k})` }}>
                <span className="type-meta">
                  {k} · {String(v.$value)}
                </span>
                Get paid faster
              </p>
            ))}
        </section>
        <section className="panel">
          <h2>Spacing, radius & elevation</h2>
          {leaves(tokens.space as unknown as Group).map(([k, v]) => (
            <div key={k} className="space-row">
              <span className="type-meta">space-{k}</span>
              <span className="space-bar" style={{ width: `var(--space-${k})` }} />
              <span className="muted small">{String(v.$value)}</span>
            </div>
          ))}
          <div className="sample-row mt">
            {leaves(tokens.radius as unknown as Group).map(([k]) => (
              <span key={k} className="radius-box" style={{ borderRadius: `var(--radius-${k})` }}>
                {k}
              </span>
            ))}
          </div>
          <div className="sample-row">
            {leaves(tokens.shadow as unknown as Group).map(([k]) => (
              <span key={k} className="radius-box shadow-box" style={{ boxShadow: `var(--shadow-${k})` }}>
                {k}
              </span>
            ))}
          </div>
        </section>
      </div>
      <section className="panel">
        <h2>Components</h2>
        <div className="sample-row">
          <button className="btn btn-primary">Primary</button>
          <button className="btn">Secondary</button>
          <button className="btn btn-ghost">Ghost</button>
          <button className="btn btn-danger">Danger</button>
          <button className="btn btn-primary" disabled>
            Disabled
          </button>
        </div>
        <div className="sample-row">
          {(["draft", "sent", "partial", "overdue", "paid", "void"] as const).map((s) => (
            <StatusPill key={s} status={s} />
          ))}
        </div>
        <div className="sample-row">
          <ClientMark client={sample} size={40} />
          <strong className="num">
            <Money minor={1284550} currency="USD" />
          </strong>
          <Money minor={356000000} currency="PKR" />
          <Money minor={98000} currency="EUR" />
          <span>
            <Kbd>⌘</Kbd> <Kbd>S</Kbd>
          </span>
        </div>
        <div className="sample-row">
          <label className="field" style={{ minWidth: 220 }}>
            <span>Amount</span>
            <input placeholder="0.00" inputMode="decimal" />
          </label>
          <label className="field" style={{ minWidth: 220 }}>
            <span>With error</span>
            <input aria-invalid defaultValue="-5" />
            <small className="field-error">Amount must be above zero</small>
          </label>
        </div>
      </section>
    </div>
  );
}
