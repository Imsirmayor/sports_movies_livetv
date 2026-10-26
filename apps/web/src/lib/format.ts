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

export function formatScore(
  score: { home: number | null; away: number | null } | null
): string | null {
  if (!score) return null;
  if (score.home === null || score.away === null) return null;
  return `${score.home} – ${score.away}`;
}
