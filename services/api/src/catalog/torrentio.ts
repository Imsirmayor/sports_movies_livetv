/**
 * Torrentio stream fetch + ranking — ported from Discord bot `src/services/torrentio.ts`.
 * Stream URLs stay server-side; clients only see ranked options by index.
 */

import { isDebridCachedHint } from "./debrid-ready.js";

export type TorrentioStream = {
  name: string;
  title: string;
  url: string;
  behaviorHints?: { filename?: string; bingeGroup?: string };
};

export type RankedStream = {
  index: number;
  name: string;
  title: string;
  resolution: number;
  codec: string;
  sizeBytes: number;
  seeders: number;
  language: string;
  label: string;
  cached: boolean;
  /** Server-only; stripped before API responses. */
  url: string;
};

function parseResolution(title: string, bingeGroup?: string): number {
  const combined = `${title} ${bingeGroup ?? ""}`;
  if (/2160p|4k/i.test(combined)) return 2160;
  if (/1080p/i.test(combined)) return 1080;
  if (/720p/i.test(combined)) return 720;
  if (/480p/i.test(combined)) return 480;
  if (/360p/i.test(combined)) return 360;
  return 0;
}

function parseCodec(title: string, bingeGroup?: string): string {
  const combined = `${title} ${bingeGroup ?? ""}`;
  if (/x265|h\.?265|hevc/i.test(combined)) return "h265";
  if (/x264|h\.?264|avc/i.test(combined)) return "h264";
  if (/av1/i.test(combined)) return "av1";
  return "unknown";
}

function parseSizeBytes(title: string): number {
  const match = title.match(/💾\s*([\d.]+)\s*(GB|MB|TB)/i);
  if (!match) return 0;
  const value = Number.parseFloat(match[1]!);
  const unit = match[2]!.toUpperCase();
  if (unit === "TB") return value * 1024 ** 4;
  if (unit === "GB") return value * 1024 ** 3;
  return value * 1024 ** 2;
}

function parseSeeders(title: string): number {
  const match = title.match(/👤\s*(\d+)/);
  return match ? Number.parseInt(match[1]!, 10) : 0;
}

function parseLanguage(title: string): string {
  const flagMatch = title.match(
    /[\u{1F1E6}-\u{1F1FF}]{2}(?:\s*\/\s*[\u{1F1E6}-\u{1F1FF}]{2})*/u
  );
  if (flagMatch) return flagMatch[0];
  const langMatch = title.match(
    /\b(Multi|Dual|ENG|SPA|FRE|GER|ITA|JPN|KOR|RUS|POR|ARA|HIN|CHI)\b/i
  );
  return langMatch ? langMatch[1]!.toUpperCase() : "";
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return "? MB";
}

async function fetchStreamsJson(
  stremioAddonUrl: string,
  path: string
): Promise<TorrentioStream[]> {
  const base = stremioAddonUrl.replace(/\/$/, "");
  const url = `${base}${path}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) {
    throw new Error(`Torrentio error: ${res.status}`);
  }
  const data = (await res.json()) as { streams?: TorrentioStream[] };
  return data.streams ?? [];
}

export async function fetchMovieStreams(
  stremioAddonUrl: string,
  imdbId: string
): Promise<TorrentioStream[]> {
  return fetchStreamsJson(
    stremioAddonUrl,
    `/stream/movie/${encodeURIComponent(imdbId)}.json`
  );
}

export async function fetchSeriesStreams(
  stremioAddonUrl: string,
  imdbId: string,
  season: number,
  episode: number
): Promise<TorrentioStream[]> {
  return fetchStreamsJson(
    stremioAddonUrl,
    `/stream/series/${encodeURIComponent(imdbId)}:${season}:${episode}.json`
  );
}

export function rankStreams(
  streams: TorrentioStream[],
  maxResolution: number,
  count = 8
): RankedStream[] {
  const parsed = streams.map((stream) => ({
    stream,
    resolution: parseResolution(stream.title, stream.behaviorHints?.bingeGroup),
    codec: parseCodec(stream.title, stream.behaviorHints?.bingeGroup),
    sizeBytes: parseSizeBytes(stream.title),
    seeders: parseSeeders(stream.title),
    language: parseLanguage(stream.title),
  }));

  const eligible = parsed.filter((s) => s.resolution > 0 && s.resolution <= maxResolution);
  const candidates =
    eligible.length > 0 ? eligible : parsed.filter((s) => s.resolution > 0);

  const list =
    candidates.length > 0
      ? candidates
      : streams.slice(0, count).map((stream) => ({
          stream,
          resolution: 0,
          codec: "unknown",
          sizeBytes: 0,
          seeders: 0,
          language: parseLanguage(stream.title),
        }));

  list.sort((a, b) => {
    const aCached = isDebridCachedHint(a.stream.name, a.stream.title) ? 1 : 0;
    const bCached = isDebridCachedHint(b.stream.name, b.stream.title) ? 1 : 0;
    if (aCached !== bCached) return bCached - aCached;
    if (a.seeders !== b.seeders) return b.seeders - a.seeders;
    if (a.resolution !== b.resolution) return b.resolution - a.resolution;
    const codecScore = (c: string) => (c === "h264" ? 1 : 0);
    if (codecScore(a.codec) !== codecScore(b.codec)) {
      return codecScore(b.codec) - codecScore(a.codec);
    }
    return b.sizeBytes - a.sizeBytes;
  });

  return list.slice(0, count).map((c, index) => {
    const cached = isDebridCachedHint(c.stream.name, c.stream.title);
    return {
      index,
      name: c.stream.name,
      title: c.stream.title,
      resolution: c.resolution,
      codec: c.codec,
      sizeBytes: c.sizeBytes,
      seeders: c.seeders,
      language: c.language,
      cached,
      label: `${index + 1}. ${cached ? "Cached · " : ""}${c.resolution || "?"}p ${c.codec.toUpperCase()} | ${formatSize(c.sizeBytes)} | ${c.seeders} seeds${c.language ? ` | ${c.language}` : ""}`,
      url: c.stream.url,
    };
  });
}

export function toPublicStreamOption(s: RankedStream) {
  return {
    index: s.index,
    name: s.name,
    label: s.label,
    resolution: s.resolution,
    codec: s.codec,
    sizeBytes: s.sizeBytes,
    seeders: s.seeders,
    language: s.language,
    cached: s.cached,
  };
}
