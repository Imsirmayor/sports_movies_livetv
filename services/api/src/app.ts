import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { join } from "node:path";
import { createReadStream, existsSync, statSync } from "node:fs";
import {
  CreatePlaybackRequestSchema,
  CreateLivePlaybackRequestSchema,
  CreateCatalogPlaybackRequestSchema,
  CreateSeriesPlaybackRequestSchema,
  SportEventStatusSchema,
  AdsPrerollRequestSchema,
  AdsEventRequestSchema,
  ApiErrorCodes,
} from "@frankenstein/shared-types";
import { JobManager, isFfmpegAvailable } from "@frankenstein/media-worker";
import type { ApiConfig } from "./config.js";
import { MediaCatalog } from "./catalog.js";
import { SessionService } from "./sessions.js";
import { SportsService } from "./sports/service.js";
import { CatalogService } from "./catalog/service.js";
import { StreamCache, movieCacheKey, seriesCacheKey } from "./catalog/stream-cache.js";
import { CatalogWarmer } from "./catalog/warmer.js";
import { createR2Client } from "./catalog/r2.js";
import { downloadSubtitleAsVtt, fetchSubtitles } from "./catalog/opensubtitles.js";
import { AdsService } from "./ads/service.js";
import { loadAdsOptionsFromEnv } from "./ads/load-config.js";
import { createAuthMiddleware } from "./auth.js";
import { HttpError, sendError } from "./errors.js";

export interface AppContext {
  app: Express;
  config: ApiConfig;
  catalog: MediaCatalog;
  jobs: JobManager;
  sessions: SessionService;
  sports: SportsService;
  movies: CatalogService;
  warmer: CatalogWarmer | null;
  shutdown: () => Promise<void>;
}

function param(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export async function createApp(config: ApiConfig): Promise<AppContext> {
  const catalog = new MediaCatalog(config.mediaRoot);
  await catalog.refresh();

  let fixtureMediaId = config.sportsFixtureMediaId;
  if (config.sportsProvider === "fixture" && !fixtureMediaId) {
    const first = catalog.list()[0];
    fixtureMediaId = first?.id ?? null;
  }

  const sports = new SportsService({
    mode: config.sportsProvider,
    fixtureMediaId,
  });

  const movies = new CatalogService({
    stremioAddonUrl: config.stremioAddonUrl,
    maxResolution: config.maxResolution,
  });

  const jobs = new JobManager({
    mediaRoot: config.mediaRoot,
    workRoot: config.workRoot,
    ffmpegBinary: config.ffmpegBinary,
    maxConcurrentJobs: config.maxConcurrentJobs,
    maxEdgeSessions: config.maxEdgeSessions,
    jobTimeoutMs: config.jobTimeoutMs,
  });
  // Drop leftover remux folders from previous crashes (can be tens of GB).
  await jobs.purgeOrphanWorkDirs();

  const streamCache = config.streamCacheRoot
    ? new StreamCache(config.streamCacheRoot, config.streamCacheMaxEntries)
    : null;
  let r2Active = false;
  if (streamCache) {
    await streamCache.init();
    if (config.r2) {
      try {
        const r2 = await createR2Client(config.r2);
        streamCache.setR2Client(r2);
        r2Active = true;
        console.info(
          `[INFO] [R2] CDN enabled bucket=${config.r2.bucket} public=${config.r2.publicBaseUrl}`
        );
      } catch (err) {
        console.warn(
          `[WARN] R2 client init failed — using local .media-cache only: ${
            err instanceof Error ? err.message : err
          }`
        );
      }
    } else {
      console.info("[INFO] [Cache] R2 not configured — local .media-cache only");
    }
  }

  const sessions = new SessionService(catalog, jobs, streamCache);

  const warmer = movies.isConfigured()
    ? new CatalogWarmer({
        catalog: movies,
        cache: streamCache,
        jobs,
        intervalMs: config.catalogWarmIntervalMs,
        popularCount: config.catalogWarmCount,
        fullRemux: Boolean(streamCache) && config.catalogWarmFullRemux,
        getHeavyJobs: () => jobs.getHeavyActiveCount(),
        maxHeavyJobs: config.maxConcurrentJobs,
      })
    : null;

  const ads = new AdsService(loadAdsOptionsFromEnv());
  const requireAuth = createAuthMiddleware(config.apiToken);

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));

  app.get("/api/health", async (_req, res, next) => {
    try {
      const ffmpegAvailable = await isFfmpegAvailable(config.ffmpegBinary);
      const adsConfig = ads.getConfig();
      res.json({
        status: "ok",
        service: "frankenstein-api",
        timestamp: new Date().toISOString(),
        ffmpegAvailable,
        mediaRootConfigured: existsSync(config.mediaRoot),
        activeSessions: sessions.getActiveSessionCount(),
        sportsProvider: sports.getProviderName(),
        catalogConfigured: movies.isConfigured(),
        streamCacheEnabled: Boolean(streamCache),
        r2Enabled: r2Active,
        /** r2_then_local | local | off */
        streamDelivery: !streamCache ? "off" : r2Active ? "r2_then_local" : "local",
        maxConcurrentJobs: config.maxConcurrentJobs,
        maxEdgeSessions: config.maxEdgeSessions,
        catalogWarmerEnabled: Boolean(warmer && config.catalogWarmIntervalMs > 0),
        catalogWarmFullRemux: Boolean(streamCache) && config.catalogWarmFullRemux,
        adsEnabled: adsConfig.enabled,
        adsPrerollEnabled: adsConfig.prerollEnabled,
      });
    } catch (err) {
      next(err);
    }
  });

  // ── Ads (config + preroll decisioning + event beacons) ───────────────
  app.get("/api/ads/config", requireAuth, (_req, res) => {
    res.json(ads.getConfig());
  });

  app.post("/api/ads/preroll", requireAuth, (req, res, next) => {
    try {
      const parsed = AdsPrerollRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw new HttpError(
          400,
          ApiErrorCodes.VALIDATION_ERROR,
          "Invalid preroll request",
          parsed.error.flatten()
        );
      }
      res.json(ads.decidePreroll(parsed.data));
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/ads/events", requireAuth, (req, res, next) => {
    try {
      const parsed = AdsEventRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw new HttpError(
          400,
          ApiErrorCodes.VALIDATION_ERROR,
          "Invalid ad event",
          parsed.error.flatten()
        );
      }
      ads.trackEvent(parsed.data);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/media", requireAuth, async (_req, res, next) => {
    try {
      await catalog.refresh();
      res.json({ items: catalog.list() });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/media/search", requireAuth, async (req, res, next) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : "";
      await catalog.refresh();
      res.json({ query: q, items: catalog.search(q) });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/media/:id", requireAuth, async (req, res, next) => {
    try {
      await catalog.refresh();
      const item = catalog.get(param(req.params.id));
      if (!item) {
        throw new HttpError(404, ApiErrorCodes.NOT_FOUND, "Media not found");
      }
      const { absolutePath: _a, ...publicItem } = item;
      res.json(publicItem);
    } catch (err) {
      next(err);
    }
  });

  // ── Movie catalog (Cinemeta + Torrentio) ───────────────────────────────

  app.get("/api/catalog/movies", requireAuth, async (_req, res, next) => {
    try {
      if (!movies.isConfigured()) {
        res.json({ items: [], providerConfigured: false });
        return;
      }
      const items = await movies.topMovies();
      res.json({ items, providerConfigured: true });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/catalog/movies/search", requireAuth, async (req, res, next) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
      if (!q) {
        throw new HttpError(400, ApiErrorCodes.VALIDATION_ERROR, "Query parameter q is required");
      }
      if (!movies.isConfigured()) {
        res.json({ query: q, items: [], providerConfigured: false });
        return;
      }
      const items = await movies.searchMovies(q);
      res.json({ query: q, items, providerConfigured: true });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/catalog/movies/:imdbId", requireAuth, async (req, res, next) => {
    try {
      const meta = await movies.getMovie(param(req.params.imdbId));
      res.json(meta);
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/catalog/movies/:imdbId/streams", requireAuth, async (req, res, next) => {
    try {
      const imdbId = param(req.params.imdbId);
      const result = await movies.listMovieStreams(imdbId);
      const streams = [];
      for (const s of result.streams) {
        const key = movieCacheKey(imdbId, s.index);
        const locallyCached = streamCache
          ? (await streamCache.has(key)) ||
            Boolean(await streamCache.getR2PlaylistUrl(key))
          : false;
        streams.push({ ...s, locallyCached });
      }
      const readyCount = streams.filter((s) => s.locallyCached).length;
      res.json({
        ...result,
        streams,
        edge: {
          streamCacheEnabled: Boolean(streamCache),
          warmerEnabled: Boolean(warmer && config.catalogWarmIntervalMs > 0),
          readyCount,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  /** Background warm: RealDebrid cache (+ optional local HLS) for faster later playback. */
  app.post("/api/catalog/movies/:imdbId/warm", requireAuth, async (req, res, next) => {
    try {
      const imdbId = param(req.params.imdbId);
      if (!warmer) {
        res.status(202).json({ queued: false, reason: "warmer_unavailable" });
        return;
      }
      warmer.enqueueMovie(imdbId);
      res.status(202).json({ queued: true, imdbId });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/catalog/movies/:imdbId/subtitles", requireAuth, async (req, res, next) => {
    try {
      const imdbId = param(req.params.imdbId);
      const subs = await fetchSubtitles("movie", imdbId);
      res.json({
        imdbId,
        subtitles: subs.map((s) => ({
          id: s.id,
          lang: s.lang,
          vttPath: `/api/catalog/movies/${encodeURIComponent(imdbId)}/subtitles/${encodeURIComponent(s.lang)}/vtt`,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  app.get(
    "/api/catalog/movies/:imdbId/subtitles/:lang/vtt",
    requireAuth,
    async (req, res, next) => {
      try {
        const imdbId = param(req.params.imdbId);
        const lang = param(req.params.lang);
        const subs = await fetchSubtitles("movie", imdbId);
        const hit = subs.find((s) => s.lang === lang) ?? subs.find((s) => s.lang.startsWith(lang));
        if (!hit) {
          throw new HttpError(404, ApiErrorCodes.NOT_FOUND, "Subtitle language not found");
        }
        const vtt = await downloadSubtitleAsVtt(hit);
        res.setHeader("Content-Type", "text/vtt; charset=utf-8");
        res.setHeader("Cache-Control", "public, max-age=3600");
        res.send(vtt);
      } catch (err) {
        next(err);
      }
    }
  );

  app.post("/api/catalog/movies/playback", requireAuth, async (req, res, next) => {
    try {
      const parsed = CreateCatalogPlaybackRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new HttpError(
          400,
          ApiErrorCodes.VALIDATION_ERROR,
          "Invalid request body",
          parsed.error.flatten()
        );
      }
      const session = await sessions.createCatalogMovie(
        parsed.data.imdbId,
        parsed.data.streamIndex,
        movies,
        parsed.data.preferredAudioLang
      );
      res.status(201).json(session);
    } catch (err) {
      next(err);
    }
  });

  // ── Series catalog ────────────────────────────────────────────────────

  app.get("/api/catalog/series", requireAuth, async (_req, res, next) => {
    try {
      if (!movies.isConfigured()) {
        res.json({ items: [], providerConfigured: false });
        return;
      }
      const items = await movies.topSeries();
      res.json({ items, providerConfigured: true });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/catalog/series/search", requireAuth, async (req, res, next) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
      if (!q) {
        throw new HttpError(400, ApiErrorCodes.VALIDATION_ERROR, "Query parameter q is required");
      }
      if (!movies.isConfigured()) {
        res.json({ query: q, items: [], providerConfigured: false });
        return;
      }
      const items = await movies.searchSeries(q);
      res.json({ query: q, items, providerConfigured: true });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/catalog/series/:imdbId", requireAuth, async (req, res, next) => {
    try {
      const meta = await movies.getSeries(param(req.params.imdbId));
      res.json(meta);
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/catalog/series/:imdbId/warm", requireAuth, async (req, res, next) => {
    try {
      const imdbId = param(req.params.imdbId);
      const season = Number.parseInt(String(req.query.season ?? req.body?.season ?? "1"), 10);
      const episode = Number.parseInt(String(req.query.episode ?? req.body?.episode ?? "1"), 10);
      if (!warmer) {
        res.status(202).json({ queued: false, reason: "warmer_unavailable" });
        return;
      }
      if (!Number.isFinite(season) || season < 1 || !Number.isFinite(episode) || episode < 1) {
        throw new HttpError(
          400,
          ApiErrorCodes.VALIDATION_ERROR,
          "season and episode must be positive integers"
        );
      }
      warmer.enqueueSeries(imdbId, season, episode);
      res.status(202).json({ queued: true, imdbId, season, episode });
    } catch (err) {
      next(err);
    }
  });

  app.get(
    "/api/catalog/series/:imdbId/streams",
    requireAuth,
    async (req, res, next) => {
      try {
        const season = Number.parseInt(String(req.query.season ?? ""), 10);
        const episode = Number.parseInt(String(req.query.episode ?? ""), 10);
        if (!Number.isFinite(season) || season < 1 || !Number.isFinite(episode) || episode < 1) {
          throw new HttpError(
            400,
            ApiErrorCodes.VALIDATION_ERROR,
            "Query parameters season and episode are required positive integers"
          );
        }
        const imdbId = param(req.params.imdbId);
        const result = await movies.listSeriesStreams(imdbId, season, episode);
        const streams = [];
        for (const s of result.streams) {
          const key = seriesCacheKey(imdbId, season, episode, s.index);
          const locallyCached = streamCache
            ? (await streamCache.has(key)) ||
              Boolean(await streamCache.getR2PlaylistUrl(key))
            : false;
          streams.push({ ...s, locallyCached });
        }
        const readyCount = streams.filter((s) => s.locallyCached).length;
        res.json({
          ...result,
          streams,
          edge: {
            streamCacheEnabled: Boolean(streamCache),
            warmerEnabled: Boolean(warmer && config.catalogWarmIntervalMs > 0),
            readyCount,
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  app.get("/api/catalog/series/:imdbId/subtitles", requireAuth, async (req, res, next) => {
    try {
      const imdbId = param(req.params.imdbId);
      const season = Number.parseInt(String(req.query.season ?? ""), 10);
      const episode = Number.parseInt(String(req.query.episode ?? ""), 10);
      if (!Number.isFinite(season) || season < 1 || !Number.isFinite(episode) || episode < 1) {
        throw new HttpError(
          400,
          ApiErrorCodes.VALIDATION_ERROR,
          "Query parameters season and episode are required positive integers"
        );
      }
      const subs = await fetchSubtitles("series", imdbId, season, episode);
      res.json({
        imdbId,
        subtitles: subs.map((s) => ({
          id: s.id,
          lang: s.lang,
          vttPath: `/api/catalog/series/${encodeURIComponent(imdbId)}/subtitles/${encodeURIComponent(s.lang)}/vtt?season=${season}&episode=${episode}`,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  app.get(
    "/api/catalog/series/:imdbId/subtitles/:lang/vtt",
    requireAuth,
    async (req, res, next) => {
      try {
        const imdbId = param(req.params.imdbId);
        const lang = param(req.params.lang);
        const season = Number.parseInt(String(req.query.season ?? ""), 10);
        const episode = Number.parseInt(String(req.query.episode ?? ""), 10);
        if (!Number.isFinite(season) || season < 1 || !Number.isFinite(episode) || episode < 1) {
          throw new HttpError(
            400,
            ApiErrorCodes.VALIDATION_ERROR,
            "Query parameters season and episode are required positive integers"
          );
        }
        const subs = await fetchSubtitles("series", imdbId, season, episode);
        const hit = subs.find((s) => s.lang === lang) ?? subs.find((s) => s.lang.startsWith(lang));
        if (!hit) {
          throw new HttpError(404, ApiErrorCodes.NOT_FOUND, "Subtitle language not found");
        }
        const vtt = await downloadSubtitleAsVtt(hit);
        res.setHeader("Content-Type", "text/vtt; charset=utf-8");
        res.setHeader("Cache-Control", "public, max-age=3600");
        res.send(vtt);
      } catch (err) {
        next(err);
      }
    }
  );

  app.post("/api/catalog/series/playback", requireAuth, async (req, res, next) => {
    try {
      const parsed = CreateSeriesPlaybackRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new HttpError(
          400,
          ApiErrorCodes.VALIDATION_ERROR,
          "Invalid request body",
          parsed.error.flatten()
        );
      }
      const session = await sessions.createCatalogSeriesEpisode(
        parsed.data.imdbId,
        parsed.data.season,
        parsed.data.episode,
        parsed.data.streamIndex,
        movies,
        parsed.data.preferredAudioLang
      );
      res.status(201).json(session);
    } catch (err) {
      next(err);
    }
  });

  // ── Sports ────────────────────────────────────────────────────────────

  app.get("/api/sports", requireAuth, async (_req, res, next) => {
    try {
      res.json(await sports.listCatalog());
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/sports/events", requireAuth, async (req, res, next) => {
    try {
      const statusRaw = typeof req.query.status === "string" ? req.query.status : undefined;
      let status;
      if (statusRaw) {
        const parsed = SportEventStatusSchema.safeParse(statusRaw);
        if (!parsed.success) {
          throw new HttpError(
            400,
            ApiErrorCodes.VALIDATION_ERROR,
            "Invalid status filter. Use live|upcoming|finished|unknown"
          );
        }
        status = parsed.data;
      }

      const result = await sports.search({
        query: typeof req.query.q === "string" ? req.query.q : undefined,
        team: typeof req.query.team === "string" ? req.query.team : undefined,
        sport: typeof req.query.sport === "string" ? req.query.sport : undefined,
        competition:
          typeof req.query.competition === "string" ? req.query.competition : undefined,
        status,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/sports/events/:id", requireAuth, async (req, res, next) => {
    try {
      const includeEmbed =
        req.query.embed === "1" || req.query.embed === "true";
      res.json(await sports.getEvent(param(req.params.id), includeEmbed));
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/sports/playback", requireAuth, async (req, res, next) => {
    try {
      const parsed = CreateLivePlaybackRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new HttpError(
          400,
          ApiErrorCodes.VALIDATION_ERROR,
          "Invalid request body",
          parsed.error.flatten()
        );
      }
      await catalog.refresh();
      const session = await sessions.createLive(parsed.data.eventId, sports);
      res.status(201).json(session);
    } catch (err) {
      next(err);
    }
  });

  // ── Playback (VOD + shared status/stop/stream) ────────────────────────

  app.post("/api/playback", requireAuth, async (req, res, next) => {
    try {
      const parsed = CreatePlaybackRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new HttpError(
          400,
          ApiErrorCodes.VALIDATION_ERROR,
          "Invalid request body",
          parsed.error.flatten()
        );
      }
      const session = await sessions.create(parsed.data.mediaId);
      res.status(201).json(session);
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/playback/:sessionId", requireAuth, async (req, res, next) => {
    try {
      const session = await sessions.get(param(req.params.sessionId));
      res.json(session);
    } catch (err) {
      next(err);
    }
  });

  app.delete("/api/playback/:sessionId", requireAuth, async (req, res, next) => {
    try {
      const session = await sessions.stop(param(req.params.sessionId));
      res.json(session);
    } catch (err) {
      next(err);
    }
  });

  // FFmpeg uses seg_%03d.ts → after seg_999 comes seg_1000.ts (4+ digits).
  // Restricting to exactly 3 digits caused movies to die around ~67 minutes.
  const HLS_NAME = /^(index\.m3u8|seg_\d{3,}\.ts)$/;
  app.get("/api/playback/:sessionId/stream/:name", requireAuth, (req, res, next) => {
    try {
      const sessionId = param(req.params.sessionId);
      const name = param(req.params.name);
      if (!HLS_NAME.test(name)) {
        throw new HttpError(400, ApiErrorCodes.VALIDATION_ERROR, "Invalid stream asset name");
      }

      const job = jobs.getJob(sessionId);
      if (!job || (job.status !== "ready" && job.status !== "starting")) {
        throw new HttpError(404, ApiErrorCodes.NOT_FOUND, "Stream not available");
      }

      const absolute = join(job.outputDir, name);
      if (!existsSync(absolute) || !statSync(absolute).isFile()) {
        throw new HttpError(404, ApiErrorCodes.NOT_FOUND, "Segment not found");
      }

      if (name.endsWith(".m3u8")) {
        res.type("application/vnd.apple.mpegurl");
      } else {
        res.type("video/mp2t");
      }

      createReadStream(absolute).pipe(res);
    } catch (err) {
      next(err);
    }
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    sendError(res, err);
  });

  warmer?.start();

  return {
    app,
    config,
    catalog,
    jobs,
    sessions,
    sports,
    movies,
    warmer,
    shutdown: async () => {
      warmer?.stop();
      await jobs.shutdown();
    },
  };
}
