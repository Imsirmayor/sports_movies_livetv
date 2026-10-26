/**
 * Sportsurge / StreamEast client — fetches live sports events and resolves stream URLs.
 * Adapted for https://streameast.cool event pages of the form:
 *   https://streameast.cool/{league}/{slug}/{id}
 * e.g. https://streameast.cool/laliga/real-madrid-fc-barcelona/46919168
 */

import type { SportEvent } from "@frankenstein/shared-types";
import { createLogger } from "@frankenstein/media-worker";

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
}

/**
 * Regex for event links on streameast.cool.
 * Matches: href="https://streameast.cool/{league}/{slug}/{id}"
 * Example: href="https://streameast.cool/laliga/real-madrid-fc-barcelona/46919168"
 */
const EVENT_LINK_REGEX =
  /href="https:\/\/streameast\.cool\/([^/"#?]+)\/([^/"#?]+)\/(\d+)"/g;

/**
 * Fetch all events currently listed on streameast.cool.
 * Parses event links from the server-rendered HTML.
 */
export async function fetchEvents(): Promise<SportsurgeEvent[]> {
  const html = await fetchText(BASE_URL);

  console.log("base html", html);
  
  const events: SportsurgeEvent[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(EVENT_LINK_REGEX)) {
    const league = match[1]!;
    const slug = match[2]!;
    const id = match[3]!;

    if (seen.has(id)) continue;
    seen.add(id);

    const url = `${BASE_URL}/${league}/${slug}/${id}`;

    // Convert slug to human-readable title:
    // "real-madrid-fc-barcelona" → "Real Madrid Fc Barcelona"
    const title = slug
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

    events.push({ url, title, sport: league });
  }

  log.info(`Fetched ${events.length} live events`);
  return events;
}

/**
 * Parse a single event URL of the form
 *   https://streameast.cool/{league}/{slug}/{id}
 * into its parts. Useful when you already know the event URL
 * (e.g. https://streameast.cool/laliga/real-madrid-fc-barcelona/46919168).
 */
export function parseEventUrl(eventUrl: string): {
  league: string;
  slug: string;
  id: string;
} {
  const m = eventUrl.match(
    /^https:\/\/streameast\.cool\/([^/"#?]+)\/([^/"#?]+)\/(\d+)\/?$/
  );
  if (!m) {
    throw new Error(`Invalid streameast event URL: ${eventUrl}`);
  }
  return { league: m[1]!, slug: m[2]!, id: m[3]! };
}

export function toSportsurgeRawEvent(event: SportsurgeEvent): SportsurgeRawEvent {
  const { id } = parseEventUrl(event.url);
  return {
    numericId: id,
    sourceUrl: event.url,
    title: event.title,
    sport: event.sport,
  };
}

export function toSportEvent(raw: SportsurgeRawEvent): SportEvent {
  return {
    id: `ss-${raw.numericId}`,
    sport: raw.sport,
    competition: raw.sport.toUpperCase(),
    competitionId: `ss-comp-${raw.sport}`,
    title: raw.title,
    homeTeam: null,
    awayTeam: null,
    startTime: null,
    status: "live",
    score: null,
    provider: "sportsurge",
    streamAvailability: "available",
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
  const { league, slug, id } = parseEventUrl(eventUrl);
  const streamId = await fetchStreamEmbedId(eventUrl);
  const { streamUrl, headers } = await resolveStreamUrl(streamId);

  const eventTitle = slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

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
    headers: {
      "User-Agent": SPORTSURGE_USER_AGENT,
      ...extraHeaders,
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${url}`);
  }

  return response.text();
}