import { createHash } from "node:crypto";
import { access, cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createLogger } from "@frankenstein/media-worker";

const log = createLogger("StreamCache");

export type StreamCacheMeta = {
  key: string;
  catalogId: string;
  createdAt: string;
  updatedAt: string;
  segmentCount: number;
  /** Public CDN playlist when uploaded to R2. */
  r2PlaylistUrl?: string | null;
};

function safeKeyPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
}

/** Bump when remux codec profile changes so stale silent caches are not reused. */
const CACHE_PROFILE = "a2";

export function movieCacheKey(imdbId: string, streamIndex: number): string {
  return `movie_${safeKeyPart(imdbId)}_s${streamIndex}_${CACHE_PROFILE}`;
}

export function seriesCacheKey(
  imdbId: string,
  season: number,
  episode: number,
  streamIndex: number
): string {
  return `series_${safeKeyPart(imdbId)}_S${season}E${episode}_s${streamIndex}_${CACHE_PROFILE}`;
}

/**
 * Disk cache of completed HLS remuxes so repeat plays skip RealDebrid + FFmpeg.
 */
export class StreamCache {
  private readonly root: string;
  private readonly maxEntries: number;
  private r2: import("./r2.js").R2Client | null = null;

  constructor(root: string, maxEntries = 40) {
    this.root = root;
    this.maxEntries = Math.max(1, maxEntries);
  }

  setR2Client(client: import("./r2.js").R2Client | null): void {
    this.r2 = client;
  }

  async init(): Promise<void> {
    await mkdir(this.root, { recursive: true });
  }

  dirFor(key: string): string {
    const digest = createHash("sha256").update(key).digest("hex").slice(0, 24);
    return join(this.root, `${safeKeyPart(key)}_${digest}`);
  }

  async has(key: string): Promise<boolean> {
    try {
      await access(join(this.dirFor(key), "index.m3u8"));
      return true;
    } catch {
      return false;
    }
  }

  async getPlaylistPath(key: string): Promise<string | null> {
    const playlist = join(this.dirFor(key), "index.m3u8");
    try {
      await access(playlist);
      return playlist;
    } catch {
      return null;
    }
  }

  /** Copy a finished remux directory into the cache (best-effort LRU trim). */
  async save(key: string, catalogId: string, sourceDir: string): Promise<void> {
    const dest = this.dirFor(key);
    const tmp = `${dest}.tmp-${Date.now()}`;
    try {
      await rm(tmp, { recursive: true, force: true });
      await cp(sourceDir, tmp, { recursive: true });
      const names = await readdir(tmp);
      const segments = names.filter((n) => n.endsWith(".ts")).length;
      if (segments < 1) {
        await rm(tmp, { recursive: true, force: true });
        log.warn(`Refusing to cache empty remux key=${key}`);
        return;
      }
      let r2PlaylistUrl: string | null = null;
      if (this.r2) {
        r2PlaylistUrl = await this.r2.uploadDir(key, tmp);
      }
      const meta: StreamCacheMeta = {
        key,
        catalogId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        segmentCount: segments,
        r2PlaylistUrl,
      };
      await writeFile(join(tmp, "cache.json"), JSON.stringify(meta, null, 2));
      await rm(dest, { recursive: true, force: true });
      // rename via cp+rm for cross-device safety
      await cp(tmp, dest, { recursive: true });
      await rm(tmp, { recursive: true, force: true });
      log.info(
        `Cached HLS key=${key} segments=${segments}${r2PlaylistUrl ? " (+R2)" : ""}`
      );
      await this.trim();
    } catch (err) {
      log.warn(`Cache save failed key=${key}: ${err instanceof Error ? err.message : err}`);
      await rm(tmp, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async getR2PlaylistUrl(key: string): Promise<string | null> {
    const meta = await this.readMeta(key);
    if (meta?.r2PlaylistUrl) return meta.r2PlaylistUrl;
    if (this.r2 && (await this.r2.hasObject(key))) {
      return this.r2.publicPlaylistUrl(key);
    }
    return null;
  }

  private async trim(): Promise<void> {
    const entries = await readdir(this.root, { withFileTypes: true });
    const dirs: Array<{ path: string; mtime: number }> = [];
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const path = join(this.root, ent.name);
      try {
        const st = await stat(path);
        dirs.push({ path, mtime: st.mtimeMs });
      } catch {
        /* ignore */
      }
    }
    dirs.sort((a, b) => b.mtime - a.mtime);
    for (const old of dirs.slice(this.maxEntries)) {
      await rm(old.path, { recursive: true, force: true }).catch(() => undefined);
      log.info(`Evicted HLS cache dir=${old.path}`);
    }
  }

  async readMeta(key: string): Promise<StreamCacheMeta | null> {
    try {
      const raw = await readFile(join(this.dirFor(key), "cache.json"), "utf8");
      return JSON.parse(raw) as StreamCacheMeta;
    } catch {
      return null;
    }
  }
}
