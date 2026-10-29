import { ApiErrorCodes } from "@frankenstein/shared-types";
import {
  getMovieMeta,
  getSeriesMeta,
  listTopMovies,
  listTopSeries,
  searchMovies,
  searchSeries,
  type CatalogTitle,
  type SeriesMeta,
} from "./cinemeta.js";
import {
  fetchMovieStreams,
  fetchSeriesStreams,
  rankStreams,
  toPublicStreamOption,
  type RankedStream,
} from "./torrentio.js";
import { HttpError } from "../errors.js";

export class CatalogService {
  private readonly stremioAddonUrl: string | null;
  private readonly maxResolution: number;
  /** Short-lived cache so playback can resolve stream index → URL without re-fetch races. */
  private readonly streamCache = new Map<
    string,
    { at: number; streams: RankedStream[] }
  >();

  constructor(options: { stremioAddonUrl: string | null; maxResolution: number }) {
    this.stremioAddonUrl = options.stremioAddonUrl;
    this.maxResolution = options.maxResolution;
  }

  isConfigured(): boolean {
    return Boolean(this.stremioAddonUrl);
  }

  private requireAddon(): string {
    if (!this.stremioAddonUrl) {
      throw new HttpError(
        503,
        ApiErrorCodes.PROVIDER_UNAVAILABLE,
        "Catalog requires STREMIO_ADDON_URL (Torrentio + RealDebrid) in the API environment"
      );
    }
    return this.stremioAddonUrl;
  }

  private cacheKey(kind: "movie" | "series", id: string, season?: number, episode?: number) {
    if (kind === "series") return `series:${id}:${season}:${episode}`;
    return `movie:${id}`;
  }

  async searchMovies(query: string): Promise<CatalogTitle[]> {
    this.requireAddon();
    try {
      return await searchMovies(query);
    } catch (err) {
      throw new HttpError(
        502,
        ApiErrorCodes.PROVIDER_UNAVAILABLE,
        err instanceof Error ? err.message : "Catalog search failed"
      );
    }
  }

  /** @deprecated use searchMovies — kept for older call sites */
  async search(query: string): Promise<CatalogTitle[]> {
    return this.searchMovies(query);
  }

  async searchSeries(query: string): Promise<CatalogTitle[]> {
    this.requireAddon();
    try {
      return await searchSeries(query);
    } catch (err) {
      throw new HttpError(
        502,
        ApiErrorCodes.PROVIDER_UNAVAILABLE,
        err instanceof Error ? err.message : "Series search failed"
      );
    }
  }

  async topMovies(): Promise<CatalogTitle[]> {
    this.requireAddon();
    try {
      return await listTopMovies();
    } catch (err) {
      throw new HttpError(
        502,
        ApiErrorCodes.PROVIDER_UNAVAILABLE,
        err instanceof Error ? err.message : "Failed to load popular movies"
      );
    }
  }

  async topSeries(): Promise<CatalogTitle[]> {
    this.requireAddon();
    try {
      return await listTopSeries();
    } catch (err) {
      throw new HttpError(
        502,
        ApiErrorCodes.PROVIDER_UNAVAILABLE,
        err instanceof Error ? err.message : "Failed to load popular series"
      );
    }
  }

  async getMovie(imdbId: string): Promise<CatalogTitle> {
    this.requireAddon();
    try {
      const meta = await getMovieMeta(imdbId);
      if (!meta) {
        throw new HttpError(404, ApiErrorCodes.NOT_FOUND, "Movie not found");
      }
      return meta;
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw new HttpError(
        502,
        ApiErrorCodes.PROVIDER_UNAVAILABLE,
        err instanceof Error ? err.message : "Movie lookup failed"
      );
    }
  }

  async getSeries(imdbId: string): Promise<SeriesMeta> {
    this.requireAddon();
    try {
      const meta = await getSeriesMeta(imdbId);
      if (!meta) {
        throw new HttpError(404, ApiErrorCodes.NOT_FOUND, "Series not found");
      }
      return meta;
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw new HttpError(
        502,
        ApiErrorCodes.PROVIDER_UNAVAILABLE,
        err instanceof Error ? err.message : "Series lookup failed"
      );
    }
  }

  async listMovieStreams(imdbId: string) {
    const addon = this.requireAddon();
    try {
      const raw = await fetchMovieStreams(addon, imdbId);
      const ranked = rankStreams(raw, this.maxResolution);
      this.streamCache.set(this.cacheKey("movie", imdbId), {
        at: Date.now(),
        streams: ranked,
      });
      return {
        imdbId,
        provider: "torrentio",
        streams: ranked.map(toPublicStreamOption),
      };
    } catch (err) {
      throw new HttpError(
        502,
        ApiErrorCodes.STREAM_UNAVAILABLE,
        err instanceof Error ? err.message : "Failed to list streams"
      );
    }
  }

  /** @deprecated use listMovieStreams */
  async listStreams(imdbId: string) {
    return this.listMovieStreams(imdbId);
  }

  async listSeriesStreams(imdbId: string, season: number, episode: number) {
    const addon = this.requireAddon();
    try {
      const raw = await fetchSeriesStreams(addon, imdbId, season, episode);
      const ranked = rankStreams(raw, this.maxResolution);
      this.streamCache.set(this.cacheKey("series", imdbId, season, episode), {
        at: Date.now(),
        streams: ranked,
      });
      return {
        imdbId,
        season,
        episode,
        provider: "torrentio",
        streams: ranked.map(toPublicStreamOption),
      };
    } catch (err) {
      throw new HttpError(
        502,
        ApiErrorCodes.STREAM_UNAVAILABLE,
        err instanceof Error ? err.message : "Failed to list episode streams"
      );
    }
  }

  async resolveMovieStreamUrl(imdbId: string, streamIndex: number): Promise<string> {
    this.requireAddon();
    const key = this.cacheKey("movie", imdbId);
    let cached = this.streamCache.get(key);
    if (!cached || Date.now() - cached.at > 120_000) {
      await this.listMovieStreams(imdbId);
      cached = this.streamCache.get(key);
    }
    const stream = cached?.streams.find((s) => s.index === streamIndex);
    if (!stream?.url) {
      throw new HttpError(
        404,
        ApiErrorCodes.NOT_FOUND,
        "Stream option not found — refresh the stream list and try again"
      );
    }
    return stream.url;
  }

  /** @deprecated use resolveMovieStreamUrl */
  async resolveStreamUrl(imdbId: string, streamIndex: number): Promise<string> {
    return this.resolveMovieStreamUrl(imdbId, streamIndex);
  }

  async resolveSeriesStreamUrl(
    imdbId: string,
    season: number,
    episode: number,
    streamIndex: number
  ): Promise<string> {
    this.requireAddon();
    const key = this.cacheKey("series", imdbId, season, episode);
    let cached = this.streamCache.get(key);
    if (!cached || Date.now() - cached.at > 120_000) {
      await this.listSeriesStreams(imdbId, season, episode);
      cached = this.streamCache.get(key);
    }
    const stream = cached?.streams.find((s) => s.index === streamIndex);
    if (!stream?.url) {
      throw new HttpError(
        404,
        ApiErrorCodes.NOT_FOUND,
        "Stream option not found — refresh the stream list and try again"
      );
    }
    return stream.url;
  }
}
