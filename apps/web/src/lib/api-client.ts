import {
  HealthStatusSchema,
  MediaListResponseSchema,
  MediaSearchResponseSchema,
  MediaItemSchema,
  PlaybackSessionSchema,
  SportsListResponseSchema,
  SportEventsResponseSchema,
  SportEventSchema,
  CatalogSearchResponseSchema,
  CatalogListResponseSchema,
  CatalogTitleSchema,
  CatalogStreamsResponseSchema,
  CatalogSeriesStreamsResponseSchema,
  CatalogSubtitlesResponseSchema,
  SeriesMetaSchema,
  AdsConfigSchema,
  AdsPrerollDecisionSchema,
  ApiErrorSchema,
  type HealthStatus,
  type MediaItem,
  type PlaybackSession,
  type SportsListResponse,
  type SportEventsResponse,
  type SportEvent,
  type SportEventStatus,
  type CatalogTitle,
  type CatalogStreamsResponse,
  type CatalogSearchResponse,
  type CatalogListResponse,
  type CatalogSeriesStreamsResponse,
  type CatalogSubtitlesResponse,
  type SeriesMeta,
  type AdsConfig,
  type AdsPrerollDecision,
  type AdsPrerollRequest,
  type AdsEventRequest,
} from "@frankenstein/shared-types";
import { ApiClientError } from "./api-error";

/** Browser calls the Next.js BFF; never talks to the API with a secret token. */
export const CLIENT_API_PREFIX = "/api/backend";

export type ApiClientOptions = {
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
};

export type SportEventFilters = {
  q?: string;
  team?: string;
  sport?: string;
  competition?: string;
  status?: SportEventStatus;
};

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiClientError(
      res.status,
      "INVALID_RESPONSE",
      "Server returned non-JSON response"
    );
  }
}

export function createApiClient(options: ApiClientOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl ?? CLIENT_API_PREFIX;
  const timeoutMs = options.timeoutMs ?? 30_000;

  async function request<T>(
    path: string,
    init: RequestInit,
    parse: (data: unknown) => T,
    overrideTimeoutMs?: number
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      overrideTimeoutMs ?? timeoutMs
    );
    try {
      const res = await fetchImpl(joinUrl(baseUrl, path), {
        ...init,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...init.headers,
        },
      });

      const data = await parseJson(res);

      if (!res.ok) {
        const parsedErr = ApiErrorSchema.safeParse(data);
        if (parsedErr.success) {
          throw new ApiClientError(
            res.status,
            parsedErr.data.error.code,
            parsedErr.data.error.message,
            parsedErr.data.error.details
          );
        }
        throw new ApiClientError(
          res.status,
          "HTTP_ERROR",
          `Request failed with status ${res.status}`
        );
      }

      try {
        return parse(data);
      } catch (err) {
        throw new ApiClientError(
          res.status,
          "INVALID_RESPONSE",
          err instanceof Error ? err.message : "Invalid response shape"
        );
      }
    } catch (err) {
      if (err instanceof ApiClientError) throw err;
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new ApiClientError(0, "TIMEOUT", "Request timed out");
      }
      if (err instanceof TypeError) {
        throw new ApiClientError(
          0,
          "NETWORK",
          "Network request failed — is the API reachable?"
        );
      }
      throw new ApiClientError(
        0,
        "UNKNOWN",
        err instanceof Error ? err.message : "Unknown request error"
      );
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    getHealth(): Promise<HealthStatus> {
      return request("/health", { method: "GET" }, (data) =>
        HealthStatusSchema.parse(data)
      );
    },

    listMedia(): Promise<MediaItem[]> {
      return request("/media", { method: "GET" }, (data) =>
        MediaListResponseSchema.parse(data).items
      );
    },

    searchMedia(query: string): Promise<{ query: string; items: MediaItem[] }> {
      const q = encodeURIComponent(query);
      return request(`/media/search?q=${q}`, { method: "GET" }, (data) =>
        MediaSearchResponseSchema.parse(data)
      );
    },

    getMedia(id: string): Promise<MediaItem> {
      return request(`/media/${encodeURIComponent(id)}`, { method: "GET" }, (data) =>
        MediaItemSchema.parse(data)
      );
    },

    startPlayback(mediaId: string): Promise<PlaybackSession> {
      return request(
        "/playback",
        { method: "POST", body: JSON.stringify({ mediaId }) },
        (data) => PlaybackSessionSchema.parse(data)
      );
    },

    getPlayback(sessionId: string): Promise<PlaybackSession> {
      return request(
        `/playback/${encodeURIComponent(sessionId)}`,
        { method: "GET" },
        (data) => PlaybackSessionSchema.parse(data)
      );
    },

    stopPlayback(sessionId: string): Promise<PlaybackSession> {
      return request(
        `/playback/${encodeURIComponent(sessionId)}`,
        { method: "DELETE" },
        (data) => PlaybackSessionSchema.parse(data)
      );
    },

    listSports(): Promise<SportsListResponse> {
      return request("/sports", { method: "GET" }, (data) =>
        SportsListResponseSchema.parse(data)
      );
    },

    searchSportsEvents(filters: SportEventFilters = {}): Promise<SportEventsResponse> {
      const params = new URLSearchParams();
      if (filters.q) params.set("q", filters.q);
      if (filters.team) params.set("team", filters.team);
      if (filters.sport) params.set("sport", filters.sport);
      if (filters.competition) params.set("competition", filters.competition);
      if (filters.status) params.set("status", filters.status);
      const qs = params.toString();
      return request(`/sports/events${qs ? `?${qs}` : ""}`, { method: "GET" }, (data) =>
        SportEventsResponseSchema.parse(data)
      );
    },

    getSportEvent(
      id: string,
      options: { embed?: boolean; timeoutMs?: number } = {}
    ): Promise<SportEvent> {
      const qs = options.embed ? "?embed=1" : "";
      return request(
        `/sports/events/${encodeURIComponent(id)}${qs}`,
        { method: "GET" },
        (data) => SportEventSchema.parse(data),
        options.timeoutMs
      );
    },

    startSportsPlayback(
      eventId: string,
      options: { timeoutMs?: number } = {}
    ): Promise<PlaybackSession> {
      return request(
        "/sports/playback",
        { method: "POST", body: JSON.stringify({ eventId }) },
        (data) => PlaybackSessionSchema.parse(data),
        options.timeoutMs
      );
    },

    listCatalogMovies(): Promise<CatalogListResponse> {
      return request("/catalog/movies", { method: "GET" }, (data) =>
        CatalogListResponseSchema.parse(data)
      );
    },

    searchCatalogMovies(query: string): Promise<CatalogSearchResponse> {
      const q = encodeURIComponent(query);
      return request(`/catalog/movies/search?q=${q}`, { method: "GET" }, (data) =>
        CatalogSearchResponseSchema.parse(data)
      );
    },

    getCatalogMovie(imdbId: string): Promise<CatalogTitle> {
      return request(
        `/catalog/movies/${encodeURIComponent(imdbId)}`,
        { method: "GET" },
        (data) => CatalogTitleSchema.parse(data)
      );
    },

    listCatalogMovieStreams(imdbId: string): Promise<CatalogStreamsResponse> {
      return request(
        `/catalog/movies/${encodeURIComponent(imdbId)}/streams`,
        { method: "GET" },
        (data) => CatalogStreamsResponseSchema.parse(data)
      );
    },

    /** Fire-and-forget: warm RealDebrid (+ optional local HLS) for faster later play. */
    warmCatalogMovie(imdbId: string): Promise<{ queued: boolean }> {
      return request(
        `/catalog/movies/${encodeURIComponent(imdbId)}/warm`,
        { method: "POST", body: "{}" },
        (data) => {
          const queued =
            data && typeof data === "object" && "queued" in data
              ? Boolean((data as { queued: unknown }).queued)
              : false;
          return { queued };
        }
      );
    },

    listCatalogMovieSubtitles(imdbId: string): Promise<CatalogSubtitlesResponse> {
      return request(
        `/catalog/movies/${encodeURIComponent(imdbId)}/subtitles`,
        { method: "GET" },
        (data) => CatalogSubtitlesResponseSchema.parse(data)
      );
    },

    startCatalogMoviePlayback(
      imdbId: string,
      streamIndex: number,
      preferredAudioLang?: string
    ): Promise<PlaybackSession> {
      // Debrid may need up to ~90s before the real media URL is ready.
      return request(
        "/catalog/movies/playback",
        {
          method: "POST",
          body: JSON.stringify({
            imdbId,
            streamIndex,
            ...(preferredAudioLang && preferredAudioLang !== "any"
              ? { preferredAudioLang }
              : {}),
          }),
        },
        (data) => PlaybackSessionSchema.parse(data),
        120_000
      );
    },

    listCatalogSeries(): Promise<CatalogListResponse> {
      return request("/catalog/series", { method: "GET" }, (data) =>
        CatalogListResponseSchema.parse(data)
      );
    },

    searchCatalogSeries(query: string): Promise<CatalogSearchResponse> {
      const q = encodeURIComponent(query);
      return request(`/catalog/series/search?q=${q}`, { method: "GET" }, (data) =>
        CatalogSearchResponseSchema.parse(data)
      );
    },

    getCatalogSeries(imdbId: string): Promise<SeriesMeta> {
      return request(
        `/catalog/series/${encodeURIComponent(imdbId)}`,
        { method: "GET" },
        (data) => SeriesMetaSchema.parse(data)
      );
    },

    listCatalogSeriesStreams(
      imdbId: string,
      season: number,
      episode: number
    ): Promise<CatalogSeriesStreamsResponse> {
      const qs = new URLSearchParams({
        season: String(season),
        episode: String(episode),
      });
      return request(
        `/catalog/series/${encodeURIComponent(imdbId)}/streams?${qs}`,
        { method: "GET" },
        (data) => CatalogSeriesStreamsResponseSchema.parse(data)
      );
    },

    warmCatalogSeries(
      imdbId: string,
      season: number,
      episode: number
    ): Promise<{ queued: boolean }> {
      const qs = new URLSearchParams({
        season: String(season),
        episode: String(episode),
      });
      return request(
        `/catalog/series/${encodeURIComponent(imdbId)}/warm?${qs}`,
        { method: "POST", body: "{}" },
        (data) => {
          const queued =
            data && typeof data === "object" && "queued" in data
              ? Boolean((data as { queued: unknown }).queued)
              : false;
          return { queued };
        }
      );
    },

    listCatalogSeriesSubtitles(
      imdbId: string,
      season: number,
      episode: number
    ): Promise<CatalogSubtitlesResponse> {
      const qs = new URLSearchParams({
        season: String(season),
        episode: String(episode),
      });
      return request(
        `/catalog/series/${encodeURIComponent(imdbId)}/subtitles?${qs}`,
        { method: "GET" },
        (data) => CatalogSubtitlesResponseSchema.parse(data)
      );
    },

    startCatalogSeriesPlayback(
      imdbId: string,
      season: number,
      episode: number,
      streamIndex: number,
      preferredAudioLang?: string
    ): Promise<PlaybackSession> {
      return request(
        "/catalog/series/playback",
        {
          method: "POST",
          body: JSON.stringify({
            imdbId,
            season,
            episode,
            streamIndex,
            ...(preferredAudioLang && preferredAudioLang !== "any"
              ? { preferredAudioLang }
              : {}),
          }),
        },
        (data) => PlaybackSessionSchema.parse(data),
        120_000
      );
    },

    /**
     * Rewrite a backend playlistUrl (`/api/playback/...`) to the BFF path
     * so HLS segments are fetched through the authenticated proxy.
     */
    toProxiedPlaylistUrl(playlistUrl: string | null): string | null {
      if (!playlistUrl) return null;
      if (playlistUrl.startsWith("/api/")) {
        return `${CLIENT_API_PREFIX}${playlistUrl.slice("/api".length)}`;
      }
      return playlistUrl;
    },

    getAdsConfig(): Promise<AdsConfig> {
      return request("/ads/config", { method: "GET" }, (data) => AdsConfigSchema.parse(data));
    },

    requestPreroll(body: AdsPrerollRequest): Promise<AdsPrerollDecision> {
      return request(
        "/ads/preroll",
        { method: "POST", body: JSON.stringify(body) },
        (data) => AdsPrerollDecisionSchema.parse(data)
      );
    },

    trackAdEvent(body: AdsEventRequest): Promise<void> {
      return request(
        "/ads/events",
        { method: "POST", body: JSON.stringify(body) },
        () => undefined
      );
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

export const apiClient = createApiClient();
