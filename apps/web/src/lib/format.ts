export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatStartTime(iso: string | null): string {
  if (!iso) return "Time unknown";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Time unknown";
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }) + " UTC";
}

/** Live-updating countdown label: "Starts in 12h 04m" / "Starting now". */
export function formatCountdown(
  iso: string | null | undefined,
  nowMs = Date.now()
): string | null {
  if (!iso) return null;
  const start = Date.parse(iso);
  if (!Number.isFinite(start)) return null;
  const delta = start - nowMs;
  if (delta <= 0) return "Starting now";
  const totalSec = Math.floor(delta / 1000);
  const days = Math.floor(totalSec / 86_400);
  const hours = Math.floor((totalSec % 86_400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (days > 0) return `Starts in ${days}d ${hours}h`;
  if (hours > 0) return `Starts in ${hours}h ${String(mins).padStart(2, "0")}m`;
  if (mins > 0) return `Starts in ${mins}m ${String(secs).padStart(2, "0")}s`;
  return `Starts in ${secs}s`;
}

export function formatScore(
  score: { home: number | null; away: number | null } | null
): string | null {
  if (!score) return null;
  if (score.home === null || score.away === null) return null;
  return `${score.home} – ${score.away}`;
}

/** Prefer "Home vs Away"; fall back to title (already may include vs). */
export function formatEventTitle(event: {
  title: string;
  homeTeam?: string | null;
  awayTeam?: string | null;
}): string {
  if (event.homeTeam && event.awayTeam) {
    return `${event.homeTeam} vs ${event.awayTeam}`;
  }
  return event.title;
}
