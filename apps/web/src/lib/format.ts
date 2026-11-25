export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
export const todayISO = () => new Date().toISOString().slice(0, 10);
export const addDaysISO = (iso: string, days: number) => new Date(Date.parse(iso) + days * 86_400_000).toISOString().slice(0, 10);

export const fmtDate = (iso: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) =>
  new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", opts);

export const monthLabel = (ym: string) => new Date(`${ym}-01T00:00:00`).toLocaleDateString("en-US", { month: "short" });

export function relativeDue(dueISO: string, today = todayISO()): string {
  const d = Math.round((Date.parse(dueISO) - Date.parse(today)) / 86_400_000);
  if (d === 0) return "Due today";
  if (d > 0) return `Due in ${d} day${d === 1 ? "" : "s"}`;
  return `${-d} day${d === -1 ? "" : "s"} overdue`;
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
