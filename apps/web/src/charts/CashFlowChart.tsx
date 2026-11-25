import { useMemo, useState } from "react";
import { max, min } from "d3-array";
import { scaleBand, scaleLinear } from "d3-scale";
import { curveMonotoneX, line } from "d3-shape";
import { formatMoney, type Currency, type MonthPoint } from "@ledgerly/shared";
import { useSize } from "../hooks/useSize";
import { monthLabel } from "../lib/format";

const M = { top: 16, right: 12, bottom: 28, left: 56 };

/**
 * Grouped bars (revenue vs expenses) with a net line, drawn as React SVG.
 * d3 provides the scales and the line path; React owns the DOM.
 */
export function CashFlowChart({ data, currency }: { data: MonthPoint[]; currency: Currency }) {
  const [ref, { width, height }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const iw = Math.max(0, width - M.left - M.right);
  const ih = Math.max(0, height - M.top - M.bottom);
  const narrow = width < 520;

  const { x, y, inner, netPath, ticks } = useMemo(() => {
    const x = scaleBand<string>().domain(data.map((d) => d.month)).range([0, iw]).paddingInner(0.32).paddingOuter(0.16);
    const lo = Math.min(0, min(data, (d) => d.net) ?? 0);
    const hi = max(data, (d) => Math.max(d.revenue, d.expenses)) ?? 0;
    const y = scaleLinear().domain([lo, hi || 1]).nice(4).range([ih, 0]);
    const inner = scaleBand<string>().domain(["revenue", "expenses"]).range([0, x.bandwidth()]).padding(0.12);
    const netPath =
      line<MonthPoint>()
        .x((d) => (x(d.month) ?? 0) + x.bandwidth() / 2)
        .y((d) => y(d.net))
        .curve(curveMonotoneX)(data) ?? "";
    return { x, y, inner, netPath, ticks: y.ticks(4) };
  }, [data, iw, ih]);

  const h = hover != null ? data[hover] : null;

  return (
    <div className="chart" ref={ref}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={`Revenue and expenses by month in ${currency}`}>
          <g transform={`translate(${M.left},${M.top})`}>
            {ticks.map((t) => (
              <g key={t} transform={`translate(0,${y(t)})`}>
                <line x2={iw} className={t === 0 ? "axis-zero" : "grid"} />
                <text x={-10} dy="0.32em" textAnchor="end" className="tick">
                  {formatMoney(t, currency, { compact: true })}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const bx = x(d.month) ?? 0;
              return (
                <g key={d.month} transform={`translate(${bx},0)`} opacity={hover == null || hover === i ? 1 : 0.45}>
                  <rect x={inner("revenue")} y={y(d.revenue)} width={inner.bandwidth()} height={Math.max(0, y(0) - y(d.revenue))} rx={3} className="bar-revenue" />
                  <rect x={inner("expenses")} y={y(d.expenses)} width={inner.bandwidth()} height={Math.max(0, y(0) - y(d.expenses))} rx={3} className="bar-expense" />
                  {(!narrow || i % 2 === 1) && (
                    <text x={x.bandwidth() / 2} y={ih + 18} textAnchor="middle" className="tick">
                      {monthLabel(d.month)}
                    </text>
                  )}
                  <rect x={-((x.step() - x.bandwidth()) / 2)} width={x.step()} height={ih} fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
                </g>
              );
            })}
            <path d={netPath} className="net-line" />
            {data.map((d) => (
              <circle key={d.month} cx={(x(d.month) ?? 0) + x.bandwidth() / 2} cy={y(d.net)} r={3} className="net-dot" />
            ))}
          </g>
        </svg>
      )}
      {h && hover != null && (
        <div className="tooltip" style={{ left: Math.min(Math.max(M.left + (x(h.month) ?? 0) + x.bandwidth() / 2, 90), width - 90), top: 0 }} role="status">
          <strong>{new Date(`${h.month}-01T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</strong>
          <span>
            <i className="sw sw-revenue" /> Revenue <b className="num">{formatMoney(h.revenue, currency)}</b>
          </span>
          <span>
            <i className="sw sw-expense" /> Expenses <b className="num">{formatMoney(h.expenses, currency)}</b>
          </span>
          <span>
            <i className="sw sw-net" /> Net <b className="num">{formatMoney(h.net, currency)}</b>
          </span>
        </div>
      )}
    </div>
  );
}
