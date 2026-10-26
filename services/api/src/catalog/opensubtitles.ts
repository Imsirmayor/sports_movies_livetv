import { createLogger } from "@frankenstein/media-worker";

const log = createLogger("OpenSubs");
const BASE_URL = "https://opensubtitles-v3.strem.io";

export type SubtitleEntry = {
  id: string;
  url: string;
  lang: string;
};

type OpenSubsResponse = {
  subtitles?: Array<{ id: string; url: string; lang: string }>;
};

export async function fetchSubtitles(
  type: "movie" | "series",
  imdbId: string,
  season?: number,
  episode?: number
): Promise<SubtitleEntry[]> {
  const videoId =
    type === "series" && season != null && episode != null
      ? `${imdbId}:${season}:${episode}`
      : imdbId;
  const url = `${BASE_URL}/subtitles/${type}/${encodeURIComponent(videoId)}.json`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) {
      log.warn(`OpenSubtitles ${res.status} for ${videoId}`);
      return [];
    }
    const data = (await res.json()) as OpenSubsResponse;
    const seen = new Set<string>();
    const unique: SubtitleEntry[] = [];
    for (const s of data.subtitles ?? []) {
      if (!s.lang || seen.has(s.lang)) continue;
      seen.add(s.lang);
      unique.push({ id: s.id, url: s.url, lang: s.lang });
    }
    return unique;
  } catch (err) {
    log.warn(`OpenSubtitles failed: ${err instanceof Error ? err.message : err}`);
    return [];
  }
}

export async function downloadSubtitleAsVtt(entry: SubtitleEntry): Promise<string> {
  const res = await fetch(entry.url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Subtitle download failed: ${res.status}`);
  const raw = await res.text();
  return srtOrVttToVtt(stripTags(raw));
}

function stripTags(content: string): string {
  return content.replace(/\{[^}]*\}/g, "").replace(/<[^>]*>/g, "");
}

/** Convert SRT (or already-VTT) text to WebVTT for HTML5 tracks. */
export function srtOrVttToVtt(content: string): string {
  const trimmed = content.trim();
  if (trimmed.startsWith("WEBVTT")) return trimmed;

  const blocks = trimmed.split(/\n\s*\n/);
  const cues: string[] = [];
  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length < 2) continue;
    let tsLine = lines[0]!;
    let textLines = lines.slice(1);
    if (/^\d+$/.test(tsLine) && lines.length >= 3) {
      tsLine = lines[1]!;
      textLines = lines.slice(2);
    }
    const m = tsLine.match(
      /(\d{2}:\d{2}:\d{2})[,.](\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2})[,.](\d{3})/
    );
    if (!m) continue;
    cues.push(
      `${m[1]}.${m[2]} --> ${m[3]}.${m[4]}\n${textLines.join("\n")}`
    );
  }
  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}

/** Map UI / torrentio tags to ISO 639-2 / ffmpeg language tags. */
export function normalizeAudioLang(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim().toLowerCase();
  if (!t || t === "any" || t === "multi" || t === "dual") return null;
  const map: Record<string, string> = {
    eng: "eng",
    en: "eng",
    english: "eng",
    spa: "spa",
    es: "spa",
    spanish: "spa",
    fre: "fre",
    fr: "fre",
    french: "fre",
    ger: "ger",
    de: "ger",
    german: "ger",
    ita: "ita",
    it: "ita",
    italian: "ita",
    por: "por",
    pt: "por",
    portuguese: "por",
    rus: "rus",
    ru: "rus",
    russian: "rus",
    jpn: "jpn",
    ja: "jpn",
    japanese: "jpn",
    kor: "kor",
    ko: "kor",
    korean: "kor",
    chi: "chi",
    zh: "chi",
    chinese: "chi",
    ara: "ara",
    ar: "ara",
    arabic: "ara",
    hin: "hin",
    hi: "hin",
    hindi: "hin",
  };
  return map[t] ?? (t.length === 3 ? t : null);
}
