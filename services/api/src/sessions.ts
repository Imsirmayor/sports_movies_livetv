import { randomUUID } from "node:crypto";
import type { PlaybackSession } from "@frankenstein/shared-types";
import { ApiErrorCodes } from "@frankenstein/shared-types";
import { JobManager, isProcessAlive } from "@frankenstein/media-worker";
import type { MediaCatalog } from "./catalog.js";
import type { SportsService } from "./sports/service.js";
import type { CatalogService } from "./catalog/service.js";
import { waitForPlayableRemoteUrl } from "./catalog/debrid-ready.js";
import {
  movieCacheKey,
  seriesCacheKey,
  type StreamCache,
} from "./catalog/stream-cache.js";
import { HttpError } from "./errors.js";

type SessionMeta = {
  mediaId: string | null;
  eventId: string | null;
  catalogId: string | null;
  kind: "vod" | "live";
};

export class SessionService {
  private readonly catalog: MediaCatalog;
  private readonly jobs: JobManager;
  private readonly streamCache: StreamCache | null;
  private readonly sessions = new Map<string, SessionMeta>();

  constructor(
    catalog: MediaCatalog,
    jobs: JobManager,
    streamCache: StreamCache | null = null
  ) {
    this.catalog = catalog;
    this.jobs = jobs;
    this.streamCache = streamCache;
  }

  getActiveSessionCount(): number {
    return this.jobs.getActiveCount();
  }

  async create(mediaId: string): Promise<PlaybackSession> {
    const media = this.catalog.get(mediaId);
    if (!media) {
      throw new HttpError(404, ApiErrorCodes.NOT_FOUND, "Media not found");
    }

    const sessionId = randomUUID();
    this.sessions.set(sessionId, {
      mediaId,
      eventId: null,
      catalogId: null,
      kind: "vod",
    });

    try {
      const job = await this.jobs.startHlsJob(sessionId, media.absolutePath);
      return this.toSession(sessionId, this.sessions.get(sessionId)!, job);
    } catch (err) {
      this.sessions.delete(sessionId);
      return this.rethrowStartError(err);
    }
  }

  /**
   * Live sports session: fixture local file, or Sportsurge remote remux.
   */
  async createLive(eventId: string, sports: SportsService): Promise<PlaybackSession> {
    const event = await sports.getEvent(eventId);

    if (event.streamAvailability === "unavailable") {
      throw new HttpError(
        409,
        ApiErrorCodes.STREAM_UNAVAILABLE,
        "No playable stream is available for this event"
      );
    }
    if (event.streamAvailability === "provider_required") {
      throw new HttpError(
        503,
        ApiErrorCodes.PROVIDER_UNAVAILABLE,
        "An authorized live stream provider is required for this event"
      );
    }

    if (event.status === "finished") {
      throw new HttpError(
        409,
        ApiErrorCodes.STREAM_UNAVAILABLE,
        "Cannot start a live session for a finished event"
      );
    }

    // Remote Sportsurge path
    if (event.streamAvailability === "available") {
      const remote = await sports.resolveRemoteStream(eventId);
      if (!remote) {
        throw new HttpError(
          409,
          ApiErrorCodes.STREAM_UNAVAILABLE,
          "Remote stream resolution is not available for this event"
        );
      }

      const sessionId = randomUUID();
      this.sessions.set(sessionId, {
        mediaId: null,
        eventId: event.id,
        catalogId: null,
        kind: "live",
      });

      try {
        const job = await this.jobs.startRemoteHlsJob(sessionId, remote.streamUrl, {
          live: true,
          headers: remote.headers,
        });
        return this.toSession(sessionId, this.sessions.get(sessionId)!, job);
      } catch (err) {
        this.sessions.delete(sessionId);
        return this.rethrowStartError(err);
      }
    }

    // Fixture local path
    if (event.streamAvailability !== "fixture") {
      throw new HttpError(
        409,
        ApiErrorCodes.STREAM_UNAVAILABLE,
        "No playable stream is available for this event"
      );
    }

    const fixtureId = sports.resolveFixtureMediaId(event);
    if (!fixtureId) {
      throw new HttpError(
        503,
        ApiErrorCodes.PROVIDER_UNAVAILABLE,
        "SPORTS_FIXTURE_MEDIA_ID is not configured for fixture live playback"
      );
    }

    const media = this.catalog.get(fixtureId);
    if (!media) {
      throw new HttpError(404, ApiErrorCodes.NOT_FOUND, "Fixture media not found");
    }

    const sessionId = randomUUID();
    this.sessions.set(sessionId, {
      mediaId: media.id,
      eventId: event.id,
      catalogId: null,
      kind: "live",
    });

    try {
      const job = await this.jobs.startHlsJob(sessionId, media.absolutePath);
      return this.toSession(sessionId, this.sessions.get(sessionId)!, job);
    } catch (err) {
      this.sessions.delete(sessionId);
      return this.rethrowStartError(err);
    }
  }

  /** Catalog movie playback via Torrentio/RealDebrid URL remuxed to HLS. */
  async createCatalogMovie(
    imdbId: string,
    streamIndex: number,
    movies: CatalogService,
    preferredAudioLang?: string | null
  ): Promise<PlaybackSession> {
    const cacheKey = movieCacheKey(imdbId, streamIndex);
    const cached = await this.tryStartFromCache(cacheKey, imdbId);
    if (cached) return cached;

    const url = await movies.resolveMovieStreamUrl(imdbId, streamIndex);
    return this.startRemoteVod(url, imdbId, cacheKey, preferredAudioLang);
  }

  async createCatalogSeriesEpisode(
    imdbId: string,
    season: number,
    episode: number,
    streamIndex: number,
    catalog: CatalogService,
    preferredAudioLang?: string | null
  ): Promise<PlaybackSession> {
    const cacheKey = seriesCacheKey(imdbId, season, episode, streamIndex);
    const catalogId = `${imdbId}:S${season}E${episode}`;
    const cached = await this.tryStartFromCache(cacheKey, catalogId);
    if (cached) return cached;

    const url = await catalog.resolveSeriesStreamUrl(
      imdbId,
      season,
      episode,
      streamIndex
    );
    return this.startRemoteVod(url, catalogId, cacheKey, preferredAudioLang);
  }

  private async tryStartFromCache(
    cacheKey: string,
    catalogId: string
  ): Promise<PlaybackSession | null> {
    if (!this.streamCache) return null;

    const sessionId = randomUUID();
    this.sessions.set(sessionId, {
      mediaId: null,
      eventId: null,
      catalogId,
      kind: "vod",
    });

    try {
      // Prefer Cloudflare R2 CDN playlist when available (no local FFmpeg slot).
      const r2Url = await this.streamCache.getR2PlaylistUrl(cacheKey);
      if (r2Url) {
        console.info(`[INFO] [Cache] R2 hit catalog=${catalogId} key=${cacheKey}`);
        const job = await this.jobs.startExternalHlsJob(sessionId, r2Url);
        return this.toSession(sessionId, this.sessions.get(sessionId)!, job);
      }

      if (!(await this.streamCache.has(cacheKey))) {
        this.sessions.delete(sessionId);
        return null;
      }

      const dir = this.streamCache.dirFor(cacheKey);
      console.info(`[INFO] [Cache] local HLS hit catalog=${catalogId} key=${cacheKey}`);
      const job = await this.jobs.startCachedHlsJob(sessionId, dir);
      return this.toSession(sessionId, this.sessions.get(sessionId)!, job);
    } catch (err) {
      this.sessions.delete(sessionId);
      console.warn(
        `[WARN] [Cache] failed to serve cache key=${cacheKey}: ${
          err instanceof Error ? err.message : err
        }`
      );
      return null;
    }
  }

  private async startRemoteVod(
    url: string,
    catalogId: string,
    cacheKey: string | null,
    preferredAudioLang?: string | null
  ): Promise<PlaybackSession> {
    const { normalizeAudioLang } = await import("./catalog/opensubtitles.js");
    const audioLang = normalizeAudioLang(preferredAudioLang);

    // Wait out RealDebrid "downloading to debrid" stubs before FFmpeg remux.
    try {
      await waitForPlayableRemoteUrl(url, {
        timeoutMs: 90_000,
        onPending: (reason, attempt) => {
          if (attempt === 1 || attempt % 5 === 0) {
            console.info(`[INFO] [Debrid] waiting catalog=${catalogId} attempt=${attempt}: ${reason}`);
          }
        },
      });
    } catch (err) {
      return this.rethrowStartError(err);
    }

    const sessionId = randomUUID();
    this.sessions.set(sessionId, {
      mediaId: null,
      eventId: null,
      catalogId,
      kind: "vod",
    });

    try {
      const job = await this.jobs.startRemoteHlsJob(sessionId, url, {
        live: false,
        audioLang,
        onComplete: async (finished, code) => {
          if (!this.streamCache || !cacheKey) return;
          if (code === 0 || finished.status === "ready") {
            await this.streamCache.save(cacheKey, catalogId, finished.outputDir);
          }
        },
      });
      return this.toSession(sessionId, this.sessions.get(sessionId)!, job);
    } catch (err) {
      this.sessions.delete(sessionId);
      return this.rethrowStartError(err);
    }
  }

  async get(sessionId: string): Promise<PlaybackSession> {
    const meta = this.sessions.get(sessionId);
    const job = this.jobs.getJob(sessionId);
    if (!meta || !job) {
      throw new HttpError(404, ApiErrorCodes.NOT_FOUND, "Playback session not found");
    }
    return this.toSession(sessionId, meta, job);
  }

  async stop(sessionId: string): Promise<PlaybackSession> {
    const meta = this.sessions.get(sessionId);
    if (!meta) {
      throw new HttpError(404, ApiErrorCodes.NOT_FOUND, "Playback session not found");
    }

    const before = this.jobs.getJob(sessionId);
    const pid = before?.pid ?? null;

    const job = await this.jobs.stopJob(sessionId);
    if (!job) {
      throw new HttpError(404, ApiErrorCodes.NOT_FOUND, "Playback session not found");
    }

    if (pid !== null) {
      const alive = await isProcessAlive(pid);
      if (alive) {
        throw new HttpError(
          500,
          ApiErrorCodes.INTERNAL,
          "FFmpeg process did not terminate after stop"
        );
      }
    }

    return this.toSession(sessionId, meta, job);
  }

  private rethrowStartError(err: unknown): never {
    const code = (err as { code?: string }).code;
    if (code === "CAPACITY") {
      throw new HttpError(429, ApiErrorCodes.CAPACITY, "Too many concurrent playback sessions");
    }
    if (code === "VALIDATION_ERROR") {
      throw new HttpError(
        400,
        ApiErrorCodes.VALIDATION_ERROR,
        err instanceof Error ? err.message : "Invalid stream source"
      );
    }
    if (code === "STREAM_UNAVAILABLE") {
      throw new HttpError(
        409,
        ApiErrorCodes.STREAM_UNAVAILABLE,
        err instanceof Error ? err.message : "Stream not ready"
      );
    }
    throw new HttpError(
      500,
      ApiErrorCodes.FFMPEG_FAILED,
      err instanceof Error ? err.message : "Failed to start playback"
    );
  }

  private toSession(
    sessionId: string,
    meta: SessionMeta,
    job: {
      status: string;
      createdAt: string;
      updatedAt: string;
      errorMessage: string | null;
      pid: number | null;
      externalPlaylistUrl?: string | null;
    }
  ): PlaybackSession {
    const status =
      job.status === "starting" ||
      job.status === "ready" ||
      job.status === "failed" ||
      job.status === "stopped"
        ? job.status
        : "failed";

    const isLive = meta.kind === "live";
    const external = job.externalPlaylistUrl ?? null;

    return {
      sessionId,
      mediaId: meta.mediaId,
      eventId: meta.eventId,
      kind: meta.kind,
      capabilities: isLive
        ? { seek: false, pause: false }
        : { seek: true, pause: true },
      status,
      playlistUrl:
        status === "ready" || status === "starting"
          ? external || `/api/playback/${sessionId}/stream/index.m3u8`
          : null,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      errorCode: status === "failed" ? ApiErrorCodes.FFMPEG_FAILED : null,
      errorMessage: job.errorMessage,
      ffmpegPid: job.pid,
    };
  }
}
