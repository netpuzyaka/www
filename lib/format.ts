export function fmtCompact(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("ru-RU", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function fmtFull(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("ru-RU").format(n);
}

export function fmtDuration(sec: number): string {
  if (!sec || sec < 0) return "0:00";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

export function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}
