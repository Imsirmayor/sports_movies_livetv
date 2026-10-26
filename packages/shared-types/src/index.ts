import { z } from "zod";

export const PlaybackLifecycleSchema = z.enum([
  "starting",
  "ready",
  "failed",
  "stopped",
]);
export type PlaybackLifecycle = z.infer<typeof PlaybackLifecycleSchema>;

export const PlaybackKindSchema = z.enum(["vod", "live"]);
export type PlaybackKind = z.infer<typeof PlaybackKindSchema>;

export const PlaybackCapabilitiesSchema = z.object({
  seek: z.boolean(),
  pause: z.boolean(),
});
export type PlaybackCapabilities = z.infer<typeof PlaybackCapabilitiesSchema>;

export const HealthStatusSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("frankenstein-api"),
  timestamp: z.string().min(1),
  ffmpegAvailable: z.boolean(),
  mediaRootConfigured: z.boolean(),
  activeSessions: z.number().int().nonnegative(),
  sportsProvider: z.string().optional(),
  catalogConfigured: z.boolean().optional(),
});
export type HealthStatus = z.infer<typeof HealthStatusSchema>;

export const MediaItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  filename: z.string().min(1),
  extension: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
});
export type MediaItem = z.infer<typeof MediaItemSchema>;

export const MediaSearchResponseSchema = z.object({
  query: z.string(),
  items: z.array(MediaItemSchema),
});
export type MediaSearchResponse = z.infer<typeof MediaSearchResponseSchema>;

export const MediaListResponseSchema = z.object({
  items: z.array(MediaItemSchema),
});
export type MediaListResponse = z.infer<typeof MediaListResponseSchema>;

export const CreatePlaybackRequestSchema = z.object({
  mediaId: z.string().min(1),
});
export type CreatePlaybackRequest = z.infer<typeof CreatePlaybackRequestSchema>;

export const PlaybackSessionSchema = z.object({
  sessionId: z.string().uuid(),
  mediaId: z.string().min(1).nullable(),
  eventId: z.string().nullable().optional(),
  kind: PlaybackKindSchema.default("vod"),
  capabilities: PlaybackCapabilitiesSchema.default({ seek: true, pause: true }),
  status: PlaybackLifecycleSchema,
  playlistUrl: z.string().nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  ffmpegPid: z.number().int().positive().nullable(),
});
export type PlaybackSession = z.infer<typeof PlaybackSessionSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const ApiErrorCodes = {
  UNAUTHORIZED: "UNAUTHORIZED",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  MEDIA_UNAVAILABLE: "MEDIA_UNAVAILABLE",
  CAPACITY: "CAPACITY",
  INTERNAL: "INTERNAL",
  FFMPEG_FAILED: "FFMPEG_FAILED",
  PROVIDER_UNAVAILABLE: "PROVIDER_UNAVAILABLE",
  STREAM_UNAVAILABLE: "STREAM_UNAVAILABLE",
  AMBIGUOUS_MATCH: "AMBIGUOUS_MATCH",
} as const;

export type ApiErrorCode = (typeof ApiErrorCodes)[keyof typeof ApiErrorCodes];

// ── Sports ──────────────────────────────────────────────────────────────

export const SportEventStatusSchema = z.enum([
  "live",
  "upcoming",
  "finished",
  "unknown",
]);
export type SportEventStatus = z.infer<typeof SportEventStatusSchema>;

export const StreamAvailabilitySchema = z.enum([
  "available",
  "unavailable",
  "provider_required",
  "fixture",
]);
export type StreamAvailability = z.infer<typeof StreamAvailabilitySchema>;

export const SportCompetitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  sport: z.string().min(1),
});
export type SportCompetition = z.infer<typeof SportCompetitionSchema>;

export const SportEventSchema = z.object({
  id: z.string().min(1),
  sport: z.string().min(1),
  competition: z.string().min(1),
  competitionId: z.string().min(1),
  title: z.string().min(1),
  homeTeam: z.string().nullable(),
  awayTeam: z.string().nullable(),
  /** ISO-8601 UTC when known; null if unknown */
  startTime: z.string().nullable(),
  status: SportEventStatusSchema,
  /** Only when the provider/fixture supplies a verified score */
  score: z
    .object({
      home: z.number().int().nonnegative().nullable(),
      away: z.number().int().nonnegative().nullable(),
    })
    .nullable(),
  provider: z.string().min(1),
  streamAvailability: StreamAvailabilitySchema,
  /** Provider embed URL, resolved when the event detail is opened. */
  embedUrl: z.string().url().optional(),
});
export type SportEvent = z.infer<typeof SportEventSchema>;

export const SportsListResponseSchema = z.object({
  sports: z.array(z.string()),
  competitions: z.array(SportCompetitionSchema),
  provider: z.string(),
  providerConfigured: z.boolean(),
});
export type SportsListResponse = z.infer<typeof SportsListResponseSchema>;

export const SportEventsResponseSchema = z.object({
  query: z.string().optional(),
  filters: z
    .object({
      sport: z.string().optional(),
      competition: z.string().optional(),
      status: SportEventStatusSchema.optional(),
      team: z.string().optional(),
    })
    .optional(),
  events: z.array(SportEventSchema),
  matchScores: z
    .array(
      z.object({
        eventId: z.string(),
        score: z.number(),
      })
    )
    .optional(),
  ambiguous: z.boolean().optional(),
});
export type SportEventsResponse = z.infer<typeof SportEventsResponseSchema>;

export const CreateLivePlaybackRequestSchema = z.object({
  eventId: z.string().min(1),
});
export type CreateLivePlaybackRequest = z.infer<typeof CreateLivePlaybackRequestSchema>;

// ── Catalog (Cinemeta + Torrentio) ───────────────────────────────────────

export const CatalogTitleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["movie", "series"]),
  year: z.string().optional(),
  poster: z.string().nullable().optional(),
});
export type CatalogTitle = z.infer<typeof CatalogTitleSchema>;

export const CatalogSearchResponseSchema = z.object({
  query: z.string(),
  items: z.array(CatalogTitleSchema),
  providerConfigured: z.boolean(),
});
export type CatalogSearchResponse = z.infer<typeof CatalogSearchResponseSchema>;

export const CatalogListResponseSchema = z.object({
  items: z.array(CatalogTitleSchema),
  providerConfigured: z.boolean(),
});
export type CatalogListResponse = z.infer<typeof CatalogListResponseSchema>;

export const CatalogStreamOptionSchema = z.object({
  index: z.number().int().nonnegative(),
  name: z.string(),
  label: z.string(),
  resolution: z.number().int().nonnegative(),
  codec: z.string(),
  sizeBytes: z.number().nonnegative(),
  seeders: z.number().int().nonnegative(),
  language: z.string(),
  /** True when Torrentio marks the source as already on RealDebrid (RD+ / cached). */
  cached: z.boolean().optional().default(false),
  /** True when this server already has a finished HLS remux on disk (instant play). */
  locallyCached: z.boolean().optional().default(false),
});
export type CatalogStreamOption = z.infer<typeof CatalogStreamOptionSchema>;

export const CatalogStreamsResponseSchema = z.object({
  imdbId: z.string(),
  provider: z.string(),
  streams: z.array(CatalogStreamOptionSchema),
  /** Server-side warm/cache hints for the UI. */
  edge: z
    .object({
      streamCacheEnabled: z.boolean(),
      warmerEnabled: z.boolean(),
      readyCount: z.number().int().nonnegative(),
    })
    .optional(),
});
export type CatalogStreamsResponse = z.infer<typeof CatalogStreamsResponseSchema>;

export const CreateCatalogPlaybackRequestSchema = z.object({
  imdbId: z.string().min(1),
  streamIndex: z.number().int().nonnegative(),
  /** Prefer this audio language when remuxing (ISO 639-2 / ENG / English). */
  preferredAudioLang: z.string().min(2).max(16).optional(),
});
export type CreateCatalogPlaybackRequest = z.infer<
  typeof CreateCatalogPlaybackRequestSchema
>;

export const CatalogSubtitleSchema = z.object({
  id: z.string(),
  lang: z.string(),
  /** Authenticated API path that returns WebVTT text. */
  vttPath: z.string(),
});
export type CatalogSubtitle = z.infer<typeof CatalogSubtitleSchema>;

export const CatalogSubtitlesResponseSchema = z.object({
  imdbId: z.string(),
  subtitles: z.array(CatalogSubtitleSchema),
});
export type CatalogSubtitlesResponse = z.infer<typeof CatalogSubtitlesResponseSchema>;

export const SeriesEpisodeSchema = z.object({
  season: z.number().int().positive(),
  episode: z.number().int().positive(),
  name: z.string(),
  overview: z.string().nullable().optional(),
  released: z.string().nullable().optional(),
});
export type SeriesEpisode = z.infer<typeof SeriesEpisodeSchema>;

export const SeriesMetaSchema = CatalogTitleSchema.extend({
  episodes: z.array(SeriesEpisodeSchema),
  seasons: z.array(z.number().int().positive()),
});
export type SeriesMeta = z.infer<typeof SeriesMetaSchema>;

export const CreateSeriesPlaybackRequestSchema = z.object({
  imdbId: z.string().min(1),
  season: z.number().int().positive(),
  episode: z.number().int().positive(),
  streamIndex: z.number().int().nonnegative(),
  preferredAudioLang: z.string().min(2).max(16).optional(),
});
export type CreateSeriesPlaybackRequest = z.infer<
  typeof CreateSeriesPlaybackRequestSchema
>;

export const CatalogSeriesStreamsResponseSchema = z.object({
  imdbId: z.string(),
  season: z.number().int().positive(),
  episode: z.number().int().positive(),
  provider: z.string(),
  streams: z.array(CatalogStreamOptionSchema),
  edge: z
    .object({
      streamCacheEnabled: z.boolean(),
      warmerEnabled: z.boolean(),
      readyCount: z.number().int().nonnegative(),
    })
    .optional(),
});
export type CatalogSeriesStreamsResponse = z.infer<
  typeof CatalogSeriesStreamsResponseSchema
>;
