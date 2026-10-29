import { config as loadDotenv } from "dotenv";
import { existsSync, mkdirSync } from "node:fs";
import { isAbsolute, resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function findRepoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

const repoRoot = findRepoRoot();

// Repo .env wins over inherited shell env (avoids stale MAX_CONCURRENT_JOBS etc.).
loadDotenv({ path: resolve(repoRoot, ".env"), override: true });
loadDotenv({ path: resolve(process.cwd(), ".env"), override: true });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    throw new Error(`Invalid integer for ${name}: "${raw}"`);
  }
  return parsed;
}

function resolvePath(value: string): string {
  return isAbsolute(value) ? value : resolve(repoRoot, value);
}

export type SportsProviderMode = "fixture" | "sportsurge" | "none";

export interface ApiConfig {
  port: number;
  host: string;
  apiToken: string;
  mediaRoot: string;
  workRoot: string;
  maxConcurrentJobs: number;
  jobTimeoutMs: number;
  ffmpegBinary: string;
  sportsProvider: SportsProviderMode;
  sportsFixtureMediaId: string | null;
  /** Torrentio addon URL including RealDebrid config (same as Discord bot). */
  stremioAddonUrl: string | null;
  maxResolution: number;
  /** Local HLS remux cache root (empty disables). */
  streamCacheRoot: string | null;
  streamCacheMaxEntries: number;
  /** Popular-title warm interval; 0 disables. */
  catalogWarmIntervalMs: number;
  catalogWarmCount: number;
  /** When true, warmer also remuxes into local HLS while idle. */
  catalogWarmFullRemux: boolean;
  /** Cached / CDN edge sessions (no FFmpeg). */
  maxEdgeSessions: number;
  /** Optional Cloudflare R2 (S3 API) for public HLS CDN. */
  r2: {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
    publicBaseUrl: string;
    prefix: string;
  } | null;
}

function parseSportsProvider(raw: string): SportsProviderMode {
  if (raw === "fixture" || raw === "sportsurge" || raw === "none") return raw;
  throw new Error(`Invalid SPORTS_PROVIDER "${raw}". Use fixture|sportsurge|none`);
}

export function loadApiConfig(overrides: Partial<ApiConfig> = {}): ApiConfig {
  const mediaRoot = resolvePath(
    overrides.mediaRoot ?? optionalEnv("MEDIA_ROOT", "media/samples")
  );
  const workRoot = resolvePath(
    overrides.workRoot ?? optionalEnv("MEDIA_WORK_ROOT", ".media-work")
  );

  if (!existsSync(mediaRoot)) {
    throw new Error(`MEDIA_ROOT does not exist: ${mediaRoot}`);
  }
  if (!existsSync(workRoot)) {
    mkdirSync(workRoot, { recursive: true });
  }

  const sportsProvider =
    overrides.sportsProvider ??
    parseSportsProvider(optionalEnv("SPORTS_PROVIDER", "fixture"));

  const sportsFixtureMediaId =
    overrides.sportsFixtureMediaId !== undefined
      ? overrides.sportsFixtureMediaId
      : optionalEnv("SPORTS_FIXTURE_MEDIA_ID", "") || null;

  const stremioAddonUrl =
    overrides.stremioAddonUrl !== undefined
      ? overrides.stremioAddonUrl
      : optionalEnv("STREMIO_ADDON_URL", "") || null;

  const streamCacheRootRaw =
    overrides.streamCacheRoot !== undefined
      ? overrides.streamCacheRoot
      : optionalEnv("STREAM_CACHE_ROOT", ".media-cache");
  const streamCacheRoot =
    streamCacheRootRaw && streamCacheRootRaw !== "off"
      ? resolvePath(streamCacheRootRaw)
      : null;

  if (streamCacheRoot && !existsSync(streamCacheRoot)) {
    mkdirSync(streamCacheRoot, { recursive: true });
  }

  const r2AccountId = optionalEnv("R2_ACCOUNT_ID", "");
  const r2AccessKeyId = optionalEnv("R2_ACCESS_KEY_ID", "");
  const r2SecretAccessKey = optionalEnv("R2_SECRET_ACCESS_KEY", "");
  const r2Bucket = optionalEnv("R2_BUCKET", "");
  const r2PublicBaseUrl = optionalEnv("R2_PUBLIC_BASE_URL", "");
  const r2Configured =
    Boolean(r2AccountId && r2AccessKeyId && r2SecretAccessKey && r2Bucket && r2PublicBaseUrl) &&
    overrides.r2 !== null;
  const r2 =
    overrides.r2 !== undefined
      ? overrides.r2
      : r2Configured
        ? {
            accountId: r2AccountId,
            accessKeyId: r2AccessKeyId,
            secretAccessKey: r2SecretAccessKey,
            bucket: r2Bucket,
            publicBaseUrl: r2PublicBaseUrl,
            prefix: optionalEnv("R2_PREFIX", "hls"),
          }
        : null;

  return {
    port: overrides.port ?? parseIntEnv("API_PORT", 8787),
    host: overrides.host ?? optionalEnv("API_HOST", "127.0.0.1"),
    apiToken: overrides.apiToken ?? requireEnv("API_TOKEN"),
    mediaRoot,
    workRoot,
    maxConcurrentJobs: overrides.maxConcurrentJobs ?? parseIntEnv("MAX_CONCURRENT_JOBS", 2),
    maxEdgeSessions: overrides.maxEdgeSessions ?? parseIntEnv("MAX_EDGE_SESSIONS", 24),
    jobTimeoutMs: overrides.jobTimeoutMs ?? parseIntEnv("JOB_TIMEOUT_MS", 120_000),
    ffmpegBinary: overrides.ffmpegBinary ?? optionalEnv("FFMPEG_BINARY", "ffmpeg"),
    sportsProvider,
    sportsFixtureMediaId,
    stremioAddonUrl,
    maxResolution: overrides.maxResolution ?? parseIntEnv("MAX_RESOLUTION", 720),
    streamCacheRoot,
    streamCacheMaxEntries:
      overrides.streamCacheMaxEntries ?? parseIntEnv("STREAM_CACHE_MAX_ENTRIES", 40),
    catalogWarmIntervalMs:
      overrides.catalogWarmIntervalMs ?? parseIntEnv("CATALOG_WARM_INTERVAL_MS", 1_800_000),
    catalogWarmCount: overrides.catalogWarmCount ?? parseIntEnv("CATALOG_WARM_COUNT", 5),
    catalogWarmFullRemux:
      overrides.catalogWarmFullRemux ??
      optionalEnv("CATALOG_WARM_FULL_REMUX", "true").toLowerCase() === "true",
    r2,
  };
}
