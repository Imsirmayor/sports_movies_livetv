/**
 * RealDebrid / Torrentio resolve URLs often serve a short "downloading…" stub
 * video (green screen) until the torrent is cached. Probe and wait so FFmpeg
 * does not remux that stub into the player.
 */

const STUB_MARKERS = [
  "Torrent is being downloaded to debrid",
  "Access denied",
  "valid debrid subscription",
  "Infringing file",
  "not cached on Real-Debrid",
];

/**
 * Placeholder status videos from RD are short (~30s). Real movies are much larger.
 * Use a high floor so 5–15 MB stubs still count as pending.
 */
const STUB_MAX_BYTES = 25 * 1024 * 1024;

export type DebridProbeResult =
  | { status: "ready" }
  | { status: "pending"; reason: string }
  | { status: "denied"; reason: string }
  | { status: "error"; reason: string };

export function isDebridCachedHint(name: string, title = ""): boolean {
  const s = `${name}\n${title}`;
  if (/\[RD\+\]/i.test(s)) return true;
  if (/⚡/.test(s)) return true;
  if (/\bcached\b/i.test(s)) return true;
  return false;
}

function fullSizeFromHeaders(res: Response): number {
  const range = res.headers.get("content-range");
  if (range) {
    const m = range.match(/\/(\d+)\s*$/);
    if (m) return Number.parseInt(m[1]!, 10);
  }
  const cl = res.headers.get("content-length");
  if (cl) return Number.parseInt(cl, 10);
  return 0;
}

export async function probeRemoteMediaUrl(url: string): Promise<DebridProbeResult> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-65535", "User-Agent": "FrankensteinMedia/1.0" },
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    return {
      status: "error",
      reason: err instanceof Error ? err.message : "Probe request failed",
    };
  }

  if (res.status === 401 || res.status === 403) {
    return { status: "denied", reason: `Remote source returned HTTP ${res.status}` };
  }
  if (!res.ok && res.status !== 206) {
    return { status: "pending", reason: `Remote source not ready (HTTP ${res.status})` };
  }

  const buf = Buffer.from(await res.arrayBuffer());
  const text = buf.toString("utf8");
  const lower = text.toLowerCase();
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  const size = fullSizeFromHeaders(res);

  if (STUB_MARKERS.some((m) => lower.includes(m.toLowerCase()))) {
    if (/access denied|subscription|infringing/i.test(text)) {
      return { status: "denied", reason: "RealDebrid denied this stream" };
    }
    return { status: "pending", reason: "RealDebrid is still downloading the torrent" };
  }

  if (ct.includes("text/html") || ct.includes("application/json")) {
    return { status: "pending", reason: "Remote source returned a non-media response" };
  }

  // Tiny bodies are almost always RD status stubs remuxed as short clips.
  if (size > 0 && size < STUB_MAX_BYTES) {
    return {
      status: "pending",
      reason: `Remote media still looks like a stub (${Math.round(size / 1024)} KB)`,
    };
  }

  if (
    ct.includes("video/") ||
    ct.includes("audio/") ||
    ct.includes("mpegurl") ||
    ct.includes("octet-stream") ||
    ct.includes("mp2t") ||
    size >= STUB_MAX_BYTES
  ) {
    return { status: "ready" };
  }

  return { status: "pending", reason: `Unexpected content-type: ${ct || "unknown"}` };
}

export type WaitForPlayableOptions = {
  timeoutMs?: number;
  intervalMs?: number;
  /** Called on each pending probe (for logs / UI progress later). */
  onPending?: (reason: string, attempt: number) => void;
};

/**
 * Poll until the URL looks like real media, or fail with a clear error.
 * Cached RD+ links usually pass on the first probe.
 */
export async function waitForPlayableRemoteUrl(
  url: string,
  options: WaitForPlayableOptions = {}
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 90_000;
  const intervalMs = options.intervalMs ?? 3_000;
  const started = Date.now();
  let attempt = 0;

  while (Date.now() - started < timeoutMs) {
    attempt += 1;
    const result = await probeRemoteMediaUrl(url);
    if (result.status === "ready") return;
    if (result.status === "denied") {
      const err = new Error(result.reason);
      (err as Error & { code?: string }).code = "STREAM_UNAVAILABLE";
      throw err;
    }
    if (result.status === "error" && attempt >= 3 && Date.now() - started > 15_000) {
      const err = new Error(result.reason);
      (err as Error & { code?: string }).code = "STREAM_UNAVAILABLE";
      throw err;
    }
    options.onPending?.(
      result.status === "pending" || result.status === "error" ? result.reason : "waiting",
      attempt
    );
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  const err = new Error(
    "RealDebrid is still preparing this torrent. Pick a Cached (RD+) source or try again in a minute."
  );
  (err as Error & { code?: string }).code = "STREAM_UNAVAILABLE";
  throw err;
}
