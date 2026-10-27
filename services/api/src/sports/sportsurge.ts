/**
 * Sportsurge / StreamEast client — fetches live sports events and resolves stream URLs.
 * Adapted for https://streameast.cool event pages of the form:
 *   https://streameast.cool/{league}/{slug}/{id}
 * e.g. https://streameast.cool/laliga/real-madrid-fc-barcelona/46919168
 */

import type { SportEvent } from "@frankenstein/shared-types";
import { createLogger } from "@frankenstein/media-worker";
import { parseMatchupFromSlug } from "./matchup.js";
import { resolveMatchTiming } from "./timing.js";

const log = createLogger("Sportsurge");

const BASE_URL = "https://streameast.cool";
const EMBED_HOST = "https://gooz.aapmains.net";
const FETCH_TIMEOUT_MS = 10_000;

export const SPORTSURGE_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";

export interface SportsurgeEvent {
  url: string;
  title: string;
  sport: string;
  /** ISO-8601 kickoff when known */
  startTime: string | null;
  status: "live" | "upcoming";
}

export interface ResolvedLiveStream {
  eventTitle: string;
  sport: string;
  streamUrl: string;
  headers: Record<string, string>;
}

/** Listing row the sports service caches and turns into a catalog event. */
export interface SportsurgeRawEvent {
  numericId: string;
  sourceUrl: string;
  title: string;
  sport: string;
  startTime: string | null;
  status: "live" | "upcoming";
}

/** Event page URLs we know how to play (numeric matchup or /stream/ special). */
const EVENT_HREF_RE =
  /https:\/\/streameast\.cool\/(?:stream\/[^/"#?]+\/[^/"#?]+|[^/"#?]+\/[^/"#?]+\/\d+)/i;

/**
 * Live badge StreamEast uses for on-air games:
 *   class="… SaatZamanBilgisi btn-live …" data-zaman="…"><span …>LIVE</span></span>
 * Capture the whole opening tag so data-zaman isn't lost to greedy [^>]*.
 */
const SAAT_ZAMAN_RE =
  /<(?:span|div)\b([^>]*\bSaatZamanBilgisi\b[^>]*)>([\s\S]*?)<\/(?:span|div)>/gi;

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function humanizeSlug(slug: string): string {
  return slug
    .replace(/-live-stream$/i, "")
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function titleFromCard(cardHtml: string, url: string, slug: string): string {
  const mac = cardHtml.match(/MacBaslik[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i);
  if (mac?.[1]) {
    const t = stripHtml(mac[1]);
    if (t) return t;
  }
  try {
    const parsed = parseEventUrl(url);
    if (parsed.kind === "match") return parseMatchupFromSlug(parsed.slug).title;
  } catch {
    /* fall through */
  }
  return humanizeSlug(slug);
}

/**
 * True when StreamEast marks the card as currently on air.
 * Primary signal: `btn-live` on SaatZamanBilgisi; also inner "LIVE" text.
 */
export function isSaatZamanLive(classes: string, innerHtml: string): boolean {
  if (/\bbtn-live\b/i.test(classes)) return true;
  const text = stripHtml(innerHtml);
  return /\blive\b/i.test(text);
}

function pushEvent(
  events: SportsurgeEvent[],
  seen: Set<string>,
  event: SportsurgeEvent & { key: string }
): void {
  if (seen.has(event.key)) return;
  seen.add(event.key);
  const { key: _key, ...rest } = event;
  events.push(rest);
}

/**
 * Split homepage HTML into match-card blocks (list items).
 * Falls back to whole document if markup changes.
 */
function matchCardChunks(html: string): string[] {
  const cards = html.match(/<li\b[^>]*class="[^"]*match-card[^"]*"[\s\S]*?<\/li>/gi);
  if (cards && cards.length > 0) return cards;
  return [html];
}

function eventFromCard(cardHtml: string): (SportsurgeEvent & { key: string }) | null {
  const hrefMatch = cardHtml.match(
    /href="(https:\/\/streameast\.cool\/(?:stream\/[^/"#?]+\/[^/"#?]+|[^/"#?]+\/[^/"#?]+\/\d+))"/i
  );
  if (!hrefMatch?.[1] || !EVENT_HREF_RE.test(hrefMatch[1])) return null;
  const url = hrefMatch[1];

  let parsed;
  try {
    parsed = parseEventUrl(url);
  } catch {
    return null;
  }

  // Prefer the SaatZamanBilgisi badge inside this card.
  SAAT_ZAMAN_RE.lastIndex = 0;
  const zaman = SAAT_ZAMAN_RE.exec(cardHtml);
  const attrs = zaman?.[1] ?? "";
  const classMatch = attrs.match(/class="([^"]*)"/i);
  const classes = classMatch?.[1] ?? attrs;
  const zamanAttr = attrs.match(/data-zaman="(\d+)"/i);
  const dataZaman = zamanAttr ? Number(zamanAttr[1]) : null;
  // Inner HTML may be nested `<span style="…">LIVE</span>`.
  const labelHtml = zaman?.[2] ?? "";

  const live = isSaatZamanLive(classes, labelHtml);
  const timing = resolveMatchTiming({
    dataZaman,
    label: labelHtml,
    btnLive: live,
  });

  return {
    key: parsed.id,
    url,
    title: titleFromCard(cardHtml, url, parsed.slug),
    sport: parsed.league,
    startTime: timing.startTime,
    // btn-live / LIVE text → live + playable immediately
    status: live ? "live" : timing.status,
  };
}

/**
 * Fetch all events currently listed on streameast.cool.
 * LIVE games are detected via `SaatZamanBilgisi btn-live` (and LIVE text)
 * and marked playable immediately.
 */
export async function fetchEvents(): Promise<SportsurgeEvent[]> {
  const html = await fetchText(BASE_URL);

  const events: SportsurgeEvent[] = [];
  const seen = new Set<string>();

  for (const card of matchCardChunks(html)) {
    const event = eventFromCard(card);
    if (event) pushEvent(events, seen, event);
  }

  // Safety net: any LIVE badge we still missed via card split.
  SAAT_ZAMAN_RE.lastIndex = 0;
  for (const match of html.matchAll(SAAT_ZAMAN_RE)) {
    const attrs = match[1] ?? "";
    const classMatch = attrs.match(/class="([^"]*)"/i);
    const classes = classMatch?.[1] ?? attrs;
    const labelHtml = match[2] ?? "";
    if (!isSaatZamanLive(classes, labelHtml)) continue;

    const idx = match.index ?? 0;
    const before = html.slice(Math.max(0, idx - 2500), idx);
    const hrefs = [
      ...before.matchAll(
        /href="(https:\/\/streameast\.cool\/(?:stream\/[^/"#?]+\/[^/"#?]+|[^/"#?]+\/[^/"#?]+\/\d+))"/gi
      ),
    ];
    const href = hrefs.at(-1)?.[1];
    if (!href) continue;
    try {
      const parsed = parseEventUrl(href);
      pushEvent(events, seen, {
        key: parsed.id,
        url: href,
        title: titleFromCard(before + match[0], href, parsed.slug),
        sport: parsed.league,
        startTime: new Date().toISOString(),
        status: "live",
      });
    } catch {
      /* ignore bad href */
    }
  }

  log.info(
    `Fetched ${events.length} events (${events.filter((e) => e.status === "live").length} live)`
  );
  return events;
}

/**
 * Parse streameast event URLs:
 *   https://streameast.cool/{league}/{slug}/{id}
 *   https://streameast.cool/stream/{league}/{slug}
 */
export function parseEventUrl(eventUrl: string): {
  league: string;
  slug: string;
  id: string;
  kind: "match" | "stream";
} {
  const stream = eventUrl.match(
    /^https:\/\/streameast\.cool\/stream\/([^/"#?]+)\/([^/"#?]+)\/?$/i
  );
  if (stream) {
    return {
      kind: "stream",
      league: stream[1]!,
      slug: stream[2]!,
      id: `stream-${stream[2]!}`,
    };
  }

  const m = eventUrl.match(
    /^https:\/\/streameast\.cool\/([^/"#?]+)\/([^/"#?]+)\/(\d+)\/?$/
  );
  if (!m) {
    throw new Error(`Invalid streameast event URL: ${eventUrl}`);
  }
  return { kind: "match", league: m[1]!, slug: m[2]!, id: m[3]! };
}

export function toSportsurgeRawEvent(event: SportsurgeEvent): SportsurgeRawEvent {
  const { id } = parseEventUrl(event.url);
  return {
    numericId: id,
    sourceUrl: event.url,
    title: event.title,
    sport: event.sport,
    startTime: event.startTime,
    status: event.status,
  };
}

export function toSportEvent(raw: SportsurgeRawEvent): SportEvent {
  let homeTeam: string | null = null;
  let awayTeam: string | null = null;
  let title = raw.title;
  try {
    const parsed = parseEventUrl(raw.sourceUrl);
    if (parsed.kind === "match") {
      const matchup = parseMatchupFromSlug(parsed.slug);
      title = matchup.title;
      homeTeam = matchup.homeTeam;
      awayTeam = matchup.awayTeam;
    }
    // stream pages keep the scraped headline (e.g. NASCAR Yellawood 500)
  } catch {
    if (/\bvs\.?\b/i.test(raw.title)) {
      const parts = raw.title.split(/\s+vs\.?\s+/i);
      if (parts.length === 2) {
        homeTeam = parts[0]!.trim();
        awayTeam = parts[1]!.trim();
      }
    }
  }

  const isLive = raw.status === "live";
  let status = raw.status;
  const startTime = raw.startTime;
  if (!isLive && startTime) {
    const startMs = Date.parse(startTime);
    if (Number.isFinite(startMs) && startMs <= Date.now() + 60_000) {
      status = "live";
    }
  }

  const competition = raw.sport.replace(/-/g, " ").toUpperCase();

  return {
    id: `ss-${raw.numericId}`,
    sport: raw.sport,
    competition,
    competitionId: `ss-comp-${raw.sport}`,
    title,
    homeTeam,
    awayTeam,
    startTime,
    status,
    score: null,
    provider: "sportsurge",
    streamAvailability: status === "live" ? "available" : "unavailable",
  };
}

export async function getSportsurgeEmbedUrl(sourceUrl: string): Promise<string> {
  const streamId = await fetchStreamEmbedId(sourceUrl);
  return `${EMBED_HOST}/new-stream-embed/${streamId}`;
}

export async function resolveSportsurgeStream(
  sourceUrl: string
): Promise<ResolvedLiveStream> {
  return resolveStreamForEvent(sourceUrl);
}

/**
 * Fetch an event page and extract the internal stream embed ID.
 * Returns the numeric stream ID from the gooz.aapmains.net embed URL.
 *
 * Works for any event URL, including:
 *   https://streameast.cool/laliga/real-madrid-fc-barcelona/46919168
 */
export async function fetchStreamEmbedId(
  eventUrl: string
): Promise<string> {
  // Validate/normalize the URL shape up front.
  parseEventUrl(eventUrl);

  const html = await fetchText(eventUrl);

  const match = html.match(
    /gooz\.aapmains\.net\/new-stream-embed\/(\d+)/
  );
  if (!match?.[1]) {
    throw new Error(
      `No stream embed found on event page: ${eventUrl}`
    );
  }

  log.info(`Found embed ID: ${match[1]}`);
  return match[1];
}

/**
 * Convenience: given a single event URL, resolve directly to a stream URL.
 * Example:
 *   resolveStreamForEvent(
 *     "https://streameast.cool/laliga/real-madrid-fc-barcelona/46919168"
 *   )
 */
export async function resolveStreamForEvent(
  eventUrl: string
): Promise<ResolvedLiveStream> {
  const { league, slug, kind } = parseEventUrl(eventUrl);
  const streamId = await fetchStreamEmbedId(eventUrl);
  const { streamUrl, headers } = await resolveStreamUrl(streamId);
  const eventTitle =
    kind === "stream"
      ? humanizeSlug(slug)
      : parseMatchupFromSlug(slug).title;

  return { eventTitle, sport: league, streamUrl, headers };
}

/**
 * Resolve a stream embed ID to a direct HLS playlist URL.
 *
 * The embed page uses a Plyr + HLS.js player with a plaintext source URL:
 *   const source = "https://<host>/playlist/<id>/load-playlist";
 *   hls.loadSource(source);
 *
 * Returns the playlist URL and the HTTP headers required for playback.
 */
export async function resolveStreamUrl(
  streamId: string
): Promise<{ streamUrl: string; headers: Record<string, string> }> {
  const embedUrl = `${EMBED_HOST}/new-stream-embed/${streamId}`;

  const html = await fetchText(embedUrl, {
    Referer: `${BASE_URL}/`,
  });

  const match = html.match(
    /https?:\/\/[^\s'"]+\/playlist\/\d+\/load-playlist/
  );
  if (!match?.[0]) {
    throw new Error(
      `No playlist URL found in embed page for stream ${streamId}`
    );
  }

  const streamUrl = match[0];

  log.info(`Resolved stream URL: ${streamUrl.slice(0, 80)}...`);

  return {
    streamUrl,
    headers: {
      "User-Agent": SPORTSURGE_USER_AGENT,
      Referer: `${EMBED_HOST}/`,
      Origin: EMBED_HOST,
    },
  };
}

async function fetchText(
  url: string,
  extraHeaders?: Record<string, string>
): Promise<string> {
  const response = await fetch(url, {
    // Always bypass intermediary HTTP caches — live listings change often.
    cache: "no-store",
    headers: {
      "User-Agent": SPORTSURGE_USER_AGENT,
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      ...extraHeaders,
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${url}`);
  }

  return response.text();
}