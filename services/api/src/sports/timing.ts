/**
 * Parse StreamEast match timing labels into absolute start times.
 *
 * The site often ships a stale placeholder `data-zaman` (e.g. 1640451600) and
 * puts the real relative countdown in the span text ("13 hours from now").
 * LIVE cards use class `btn-live` and/or inner text "LIVE".
 */

export type ParsedTiming = {
  /** ISO-8601 UTC when known */
  startTime: string | null;
  status: "live" | "upcoming";
  /** True when the listing marks the match as on air */
  isLive: boolean;
};

const PLACEHOLDER_ZAMAN = 1_640_451_600; // common StreamEast stub

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/** Convert relative countdown text into milliseconds from now. */
export function parseRelativeCountdownMs(label: string): number | null {
  const text = stripTags(label).toLowerCase();
  if (!text) return null;
  if (/^live\b/.test(text) || text === "live now") return 0;

  let m = text.match(
    /(\d+)\s*(?:days?|d)\s*(?:and\s*)?(\d+)?\s*(?:hours?|hrs?|h)?\s*(?:from\s+now|away)?/
  );
  if (m && /day|d\b/.test(text)) {
    const days = Number(m[1]);
    const hours = m[2] ? Number(m[2]) : 0;
    return (days * 24 + hours) * 3_600_000;
  }

  m = text.match(/(\d+)\s*(?:hours?|hrs?|h)\s*(?:from\s+now|away)?/);
  if (m) return Number(m[1]) * 3_600_000;

  m = text.match(/(\d+)\s*(?:minutes?|mins?|m)\s*(?:from\s+now|away)?/);
  if (m) return Number(m[1]) * 60_000;

  m = text.match(/in\s+(\d+)\s*h(?:ours?)?\s*(\d+)?\s*m?/i);
  if (m) {
    return (Number(m[1]) * 60 + (m[2] ? Number(m[2]) : 0)) * 60_000;
  }

  m = text.match(/starts?\s+in\s+(\d+)\s*h(?:ours?)?\s*(\d+)?\s*m?/i);
  if (m) {
    return (Number(m[1]) * 60 + (m[2] ? Number(m[2]) : 0)) * 60_000;
  }

  return null;
}

/**
 * Prefer a plausible Unix `data-zaman`; otherwise derive from relative label.
 */
export function resolveMatchTiming(options: {
  dataZaman?: number | null;
  label?: string | null;
  btnLive?: boolean;
  nowMs?: number;
}): ParsedTiming {
  const now = options.nowMs ?? Date.now();
  const label = options.label ?? "";
  const textLive = /\blive\b/i.test(stripTags(label));
  const isLive = Boolean(options.btnLive) || textLive;

  if (isLive) {
    return {
      startTime: new Date(now).toISOString(),
      status: "live",
      isLive: true,
    };
  }

  const zaman = options.dataZaman ?? null;
  if (
    zaman != null &&
    Number.isFinite(zaman) &&
    zaman !== PLACEHOLDER_ZAMAN &&
    zaman > 1_000_000_000
  ) {
    const ms = zaman < 1e12 ? zaman * 1000 : zaman;
    // Accept only timestamps near "now" — ignore ancient stubs.
    if (ms > now - 2 * 86_400_000 && ms < now + 60 * 86_400_000) {
      const live = ms <= now + 60_000;
      return {
        startTime: new Date(ms).toISOString(),
        status: live ? "live" : "upcoming",
        isLive: live,
      };
    }
  }

  const relative = parseRelativeCountdownMs(label);
  if (relative != null) {
    const start = now + relative;
    const live = relative <= 60_000;
    return {
      startTime: new Date(start).toISOString(),
      status: live ? "live" : "upcoming",
      isLive: live,
    };
  }

  return { startTime: null, status: "upcoming", isLive: false };
}
