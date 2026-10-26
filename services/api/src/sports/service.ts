import type {
  SportCompetition,
  SportEvent,
  SportEventStatus,
  SportsListResponse,
  SportEventsResponse,
} from "@frankenstein/shared-types";
import { ApiErrorCodes } from "@frankenstein/shared-types";
import { buildFixtureCatalog } from "./fixtures.js";
import { isAmbiguous, matchAllEvents } from "./matching.js";
import {
  getSportsurgeEmbedUrl,
  fetchEvents,
  resolveSportsurgeStream,
  toSportEvent,
  toSportsurgeRawEvent,
  type ResolvedLiveStream,
  type SportsurgeRawEvent,
} from "./sportsurge.js";
import { HttpError } from "../errors.js";
import { log } from "node:console";

export type SportsProviderMode = "fixture" | "sportsurge" | "none";

const SPORTSURGE_CACHE_MS = 45_000;

export class SportsService {
  private readonly mode: SportsProviderMode;
  private readonly fixtureMediaId: string | null;
  private fixtureCache: Awaited<ReturnType<typeof buildFixtureCatalog>> | null = null;
  private sportsurgeCache:
    | { at: number; raw: SportsurgeRawEvent[]; events: SportEvent[] }
    | null = null;

  constructor(options: { mode: SportsProviderMode; fixtureMediaId?: string | null }) {
    this.mode = options.mode;
    this.fixtureMediaId = options.fixtureMediaId ?? null;
  }

  getProviderName(): string {
    return this.mode;
  }

  isConfigured(): boolean {
    return this.mode === "fixture" || this.mode === "sportsurge";
  }

  /** Clear the Sportsurge-backed catalog cache. */
  refreshFixtures(): void {
    this.fixtureCache = null;
    this.sportsurgeCache = null;
  }

  private async loadEvents(): Promise<{
    sports: string[];
    competitions: SportCompetition[];
    events: SportEvent[];
  }> {
    if (this.mode === "none") {
      return { sports: [], competitions: [], events: [] };
    }

    if (this.mode === "fixture") {
      if (
        this.sportsurgeCache &&
        Date.now() - this.sportsurgeCache.at >= SPORTSURGE_CACHE_MS
      ) {
        this.fixtureCache = null;
      }
      if (!this.fixtureCache) {
        try {
          this.fixtureCache = await buildFixtureCatalog();
          this.sportsurgeCache = {
            at: Date.now(),
            raw: this.fixtureCache.raw,
            events: this.fixtureCache.events,
          };
        } catch (err) {
          throw new HttpError(
            503,
            ApiErrorCodes.PROVIDER_UNAVAILABLE,
            err instanceof Error
              ? `Sportsurge unavailable: ${err.message}`
              : "Sportsurge unavailable"
          );
        }
      }
      const { raw: _raw, ...catalog } = this.fixtureCache;
      return catalog;
    }

    // sportsurge
    const now = Date.now();
    if (this.sportsurgeCache && now - this.sportsurgeCache.at < SPORTSURGE_CACHE_MS) {
      const events = this.sportsurgeCache.events;
      const sports = [...new Set(events.map((e) => e.sport))].sort();
      const competitions = sports.map((s) => ({
        id: `ss-comp-${s}`,
        name: s.toUpperCase(),
        sport: s,
      }));
      return { sports, competitions, events };
    }

    try {
      const raw = (await fetchEvents()).map(toSportsurgeRawEvent);

      console.log("Raw Event :", raw);
      
      const events = raw.map(toSportEvent);
      this.sportsurgeCache = { at: now, raw, events };
      const sports = [...new Set(events.map((e) => e.sport))].sort();
      const competitions = sports.map((s) => ({
        id: `ss-comp-${s}`,
        name: s.toUpperCase(),
        sport: s,
      }));
      return { sports, competitions, events };
    } catch (err) {
      throw new HttpError(
        503,
        ApiErrorCodes.PROVIDER_UNAVAILABLE,
        err instanceof Error
          ? `Sportsurge unavailable: ${err.message}`
          : "Sportsurge unavailable"
      );
    }
  }

  async listCatalog(): Promise<SportsListResponse> {
    const c = await this.loadEvents();
    return {
      sports: c.sports,
      competitions: c.competitions,
      provider: this.getProviderName(),
      providerConfigured: this.isConfigured(),
    };
  }

  async getEvent(id: string, includeEmbed = false): Promise<SportEvent> {
    if (!this.isConfigured()) {
      throw new HttpError(
        503,
        ApiErrorCodes.PROVIDER_UNAVAILABLE,
        "Sports provider is not configured"
      );
    }
    const event = (await this.loadEvents()).events.find((e) => e.id === id);
    if (!event) {
      throw new HttpError(404, ApiErrorCodes.NOT_FOUND, "Sport event not found");
    }
    if (!includeEmbed || event.provider !== "sportsurge") return event;

    const raw = this.sportsurgeCache?.raw.find((item) => `ss-${item.numericId}` === id);
    if (!raw) {
      throw new HttpError(404, ApiErrorCodes.NOT_FOUND, "Sport event source not found");
    }
    try {
      return { ...event, embedUrl: await getSportsurgeEmbedUrl(raw.sourceUrl) };
    } catch (err) {
      throw new HttpError(
        409,
        ApiErrorCodes.STREAM_UNAVAILABLE,
        err instanceof Error
          ? `Could not resolve event embed: ${err.message}`
          : "Could not resolve event embed"
      );
    }
  }

  async search(options: {
    query?: string;
    sport?: string;
    competition?: string;
    status?: SportEventStatus;
    team?: string;
  }): Promise<SportEventsResponse> {
    if (!this.isConfigured()) {
      throw new HttpError(
        503,
        ApiErrorCodes.PROVIDER_UNAVAILABLE,
        "Sports provider is not configured"
      );
    }

    let events = [...(await this.loadEvents()).events];

    if (options.sport) {
      const s = options.sport.toLowerCase();
      events = events.filter((e) => e.sport.toLowerCase() === s);
    }
    if (options.competition) {
      const c = options.competition.toLowerCase();
      events = events.filter(
        (e) =>
          e.competition.toLowerCase() === c ||
          e.competitionId.toLowerCase() === c
      );
    }
    if (options.status) {
      events = events.filter((e) => e.status === options.status);
    }

    const teamOrQuery = options.team?.trim() || options.query?.trim() || "";
    let matchScores: { eventId: string; score: number }[] | undefined;
    let ambiguous = false;

    if (teamOrQuery) {
      const scored = matchAllEvents(events, teamOrQuery);
      ambiguous = isAmbiguous(scored);
      matchScores = scored.map((m) => ({ eventId: m.event.id, score: m.score }));
      events = scored.map((m) => m.event);
    }

    return {
      query: options.query,
      filters: {
        sport: options.sport,
        competition: options.competition,
        status: options.status,
        team: options.team,
      },
      events,
      matchScores,
      ambiguous,
    };
  }

  resolveFixtureMediaId(event: SportEvent): string | null {
    if (event.streamAvailability !== "fixture") return null;
    return this.fixtureMediaId;
  }

  /**
   * Resolve a playable remote stream for Sportsurge-backed events.
   * Returns null for fixture events (use local media instead).
   */
  async resolveRemoteStream(eventId: string): Promise<ResolvedLiveStream | null> {
    const event = await this.getEvent(eventId);
    if (event.provider !== "sportsurge" || this.mode === "none") {
      return null;
    }

    await this.loadEvents();
    const raw = this.sportsurgeCache?.raw.find((r) => `ss-${r.numericId}` === eventId);
    if (!raw) {
      throw new HttpError(404, ApiErrorCodes.NOT_FOUND, "Sport event source not found");
    }

    try {
      return await resolveSportsurgeStream(raw.sourceUrl);
    } catch (err) {
      throw new HttpError(
        409,
        ApiErrorCodes.STREAM_UNAVAILABLE,
        err instanceof Error
          ? `Could not resolve live stream: ${err.message}`
          : "Could not resolve live stream"
      );
    }
  }
}
