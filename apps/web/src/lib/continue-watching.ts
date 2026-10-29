/**
 * Browser-only continue-watching. No account required — progress lives in localStorage
 * on this device/browser.
 */

export type ContinueWatchEntry = {
  /** Stable id, e.g. movie:tt123 / series:tt123:S01E02 / media:abc */
  id: string;
  title: string;
  /** Seconds into the stream */
  position: number;
  /** Total duration when known (0 if unknown) */
  duration: number;
  /** Deep link back to the title detail page */
  href: string;
  updatedAt: number;
};

const STORAGE_KEY = "bowa.continueWatching.v1";
const MAX_ENTRIES = 24;
/** Don't persist tiny scrubbing / accidental opens */
const MIN_SAVE_SECONDS = 15;
/** Treat near-end as finished and drop the entry */
const COMPLETE_RATIO = 0.95;

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readAll(): ContinueWatchEntry[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is ContinueWatchEntry =>
        Boolean(e) &&
        typeof e === "object" &&
        typeof (e as ContinueWatchEntry).id === "string" &&
        typeof (e as ContinueWatchEntry).title === "string" &&
        typeof (e as ContinueWatchEntry).position === "number" &&
        typeof (e as ContinueWatchEntry).href === "string"
    );
  } catch {
    return [];
  }
}

function writeAll(entries: ContinueWatchEntry[]): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    /* quota / private mode — ignore */
  }
}

export function movieProgressId(imdbId: string): string {
  return `movie:${imdbId}`;
}

export function seriesProgressId(imdbId: string, season: number, episode: number): string {
  return `series:${imdbId}:S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`;
}

export function localMediaProgressId(mediaId: string): string {
  return `media:${mediaId}`;
}

export function getContinueWatch(id: string): ContinueWatchEntry | null {
  return readAll().find((e) => e.id === id) ?? null;
}

export function listContinueWatch(limit = 8): ContinueWatchEntry[] {
  return readAll()
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit);
}

export function clearContinueWatch(id: string): void {
  writeAll(readAll().filter((e) => e.id !== id));
}

export function saveContinueWatch(input: {
  id: string;
  title: string;
  position: number;
  duration: number;
  href: string;
}): void {
  const position = Math.max(0, Math.floor(input.position));
  const duration = Math.max(0, Math.floor(input.duration || 0));

  if (position < MIN_SAVE_SECONDS) return;

  if (duration > 0 && position / duration >= COMPLETE_RATIO) {
    clearContinueWatch(input.id);
    return;
  }

  const next: ContinueWatchEntry = {
    id: input.id,
    title: input.title,
    position,
    duration,
    href: input.href,
    updatedAt: Date.now(),
  };

  const rest = readAll().filter((e) => e.id !== input.id);
  writeAll([next, ...rest]);
}

export function formatResumeLabel(position: number): string {
  const m = Math.floor(position / 60);
  const s = Math.floor(position % 60);
  if (m <= 0) return `${s}s`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
