import { randomUUID } from "node:crypto";
import { createLogger, type JobManager } from "@frankenstein/media-worker";
import type { CatalogService } from "./service.js";
import { waitForPlayableRemoteUrl } from "./debrid-ready.js";
import {
  movieCacheKey,
  seriesCacheKey,
  type StreamCache,
} from "./stream-cache.js";

const log = createLogger("CatalogWarmer");

export type CatalogWarmerOptions = {
  catalog: CatalogService;
  cache: StreamCache | null;
  jobs: JobManager;
  /** How often to warm popular titles (0 = disabled). */
  intervalMs: number;
  /** How many popular movies + series to warm per cycle. */
  popularCount: number;
  /** When true, also remux into local HLS cache (heavier). */
  fullRemux: boolean;
  /** Skip full remux while FFmpeg remux slots are busy (leave room for users). */
  getHeavyJobs: () => number;
  maxHeavyJobs: number;
};

/**
 * Background + on-demand warmer:
 * 1) Light: poke RealDebrid until the torrent is cached (no FFmpeg).
 * 2) Full: remux into StreamCache when idle so the next Watch is instant.
 */
export class CatalogWarmer {
  private readonly opts: CatalogWarmerOptions;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private readonly queue = new Set<string>();

  constructor(opts: CatalogWarmerOptions) {
    this.opts = opts;
  }

  start(): void {
    if (this.opts.intervalMs <= 0) {
      log.info("Catalog warmer disabled (interval 0)");
      return;
    }
    if (this.timer) return;
    log.info(
      `Catalog warmer started intervalMs=${this.opts.intervalMs} count=${this.opts.popularCount} fullRemux=${this.opts.fullRemux}`
    );
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.opts.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Fire-and-forget warm for a movie detail page. */
  enqueueMovie(imdbId: string): void {
    const key = `movie:${imdbId}`;
    if (this.queue.has(key)) return;
    this.queue.add(key);
    void this.warmMovie(imdbId)
      .catch((err) =>
        log.warn(`warm movie ${imdbId} failed: ${err instanceof Error ? err.message : err}`)
      )
      .finally(() => this.queue.delete(key));
  }

  /** Fire-and-forget warm for a series episode. */
  enqueueSeries(imdbId: string, season: number, episode: number): void {
    const key = `series:${imdbId}:S${season}E${episode}`;
    if (this.queue.has(key)) return;
    this.queue.add(key);
    void this.warmSeries(imdbId, season, episode)
      .catch((err) =>
        log.warn(`warm series ${key} failed: ${err instanceof Error ? err.message : err}`)
      )
      .finally(() => this.queue.delete(key));
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    if (!this.opts.catalog.isConfigured()) return;
    this.running = true;
    try {
      const movies = await this.opts.catalog.topMovies();
      const series = await this.opts.catalog.topSeries();
      const movieSlice = movies.slice(0, this.opts.popularCount);
      const seriesSlice = series.slice(0, this.opts.popularCount);

      for (const m of movieSlice) {
        await this.warmMovie(m.id);
      }
      for (const s of seriesSlice) {
        // Warm S1E1 as a representative episode for popular shows.
        await this.warmSeries(s.id, 1, 1);
      }
    } catch (err) {
      log.warn(`Popular warm cycle failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      this.running = false;
    }
  }

  async warmMovie(imdbId: string): Promise<void> {
    const streams = await this.opts.catalog.listMovieStreams(imdbId);
    const pick =
      streams.streams.find((s) => s.cached) ?? streams.streams[0] ?? null;
    if (!pick) {
      log.info(`No streams to warm movie=${imdbId}`);
      return;
    }
    const cacheKey = movieCacheKey(imdbId, pick.index);
    if (this.opts.cache && (await this.hasCached(cacheKey))) {
      log.info(`HLS cache hit, skip warm movie=${imdbId} stream=${pick.index}`);
      return;
    }

    const url = await this.opts.catalog.resolveMovieStreamUrl(imdbId, pick.index);
    await this.warmUrl(url, cacheKey, imdbId);
  }

  async warmSeries(imdbId: string, season: number, episode: number): Promise<void> {
    const streams = await this.opts.catalog.listSeriesStreams(imdbId, season, episode);
    const pick =
      streams.streams.find((s) => s.cached) ?? streams.streams[0] ?? null;
    if (!pick) {
      log.info(`No streams to warm series=${imdbId} S${season}E${episode}`);
      return;
    }
    const cacheKey = seriesCacheKey(imdbId, season, episode, pick.index);
    if (this.opts.cache && (await this.hasCached(cacheKey))) {
      log.info(`HLS cache hit, skip warm ${cacheKey}`);
      return;
    }

    const url = await this.opts.catalog.resolveSeriesStreamUrl(
      imdbId,
      season,
      episode,
      pick.index
    );
    await this.warmUrl(url, cacheKey, `${imdbId}:S${season}E${episode}`);
  }

  private async warmUrl(url: string, cacheKey: string, catalogId: string): Promise<void> {
    // Light warm — force RealDebrid to finish caching.
    log.info(`Debrid warm start catalog=${catalogId}`);
    try {
      await waitForPlayableRemoteUrl(url, {
        timeoutMs: 90_000,
        onPending: (reason, attempt) => {
          if (attempt === 1 || attempt % 5 === 0) {
            log.info(`Debrid warm catalog=${catalogId} attempt=${attempt}: ${reason}`);
          }
        },
      });
      log.info(`Debrid warm ready catalog=${catalogId}`);
    } catch (err) {
      log.warn(
        `Debrid warm skipped catalog=${catalogId}: ${err instanceof Error ? err.message : err}`
      );
      return;
    }

    if (!this.opts.fullRemux || !this.opts.cache) return;
    // Keep at least one heavy slot free for interactive playback.
    if (this.opts.getHeavyJobs() >= Math.max(1, this.opts.maxHeavyJobs - 1)) {
      log.info(`Skip full remux warm (heavy slots busy) catalog=${catalogId}`);
      return;
    }
    if (await this.hasCached(cacheKey)) return;

    const cache = this.opts.cache;
    const jobId = `warm-${randomUUID()}`;
    log.info(`Full remux warm start catalog=${catalogId} job=${jobId}`);
    try {
      const job = await this.opts.jobs.startRemoteHlsJob(jobId, url, {
        live: false,
        onComplete: async (finished, code) => {
          if (code === 0) {
            await cache.save(cacheKey, catalogId, finished.outputDir);
          }
          await this.opts.jobs.stopJob(jobId).catch(() => undefined);
        },
      });
      // Wait until first playlist exists (or failure), then let onComplete finish the rest.
      if (job.status === "failed") {
        log.warn(`Full remux warm failed early catalog=${catalogId}`);
        await this.opts.jobs.stopJob(jobId).catch(() => undefined);
      }
    } catch (err) {
      log.warn(
        `Full remux warm error catalog=${catalogId}: ${err instanceof Error ? err.message : err}`
      );
    }
  }

  private async hasCached(cacheKey: string): Promise<boolean> {
    if (!this.opts.cache) return false;
    if (await this.opts.cache.has(cacheKey)) return true;
    return Boolean(await this.opts.cache.getR2PlaylistUrl(cacheKey));
  }
}
