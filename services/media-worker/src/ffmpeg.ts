import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createLogger } from "./logger.js";

const execFileAsync = promisify(execFile);
const log = createLogger("FFmpeg");

export async function isFfmpegAvailable(binary = "ffmpeg"): Promise<boolean> {
  try {
    await execFileAsync(binary, ["-version"], { timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

export async function assertReadableFile(path: string): Promise<void> {
  await access(path, constants.R_OK);
}

/**
 * Build FFmpeg args for HLS VOD output suitable for browser playback.
 * Input and output paths must already be validated by the caller.
 */
export function buildHlsArgs(inputPath: string, playlistFileName: string): string[] {
  return [
    "-hide_banner",
    "-nostdin",
    "-y",
    "-i",
    inputPath,
    ...hlsTranscodeTail(playlistFileName, { live: false }),
  ];
}

export type RemoteHlsOptions = {
  live?: boolean;
  headers?: Record<string, string>;
  /** Prefer this ISO 639-2 audio language when the file has multiple tracks (e.g. eng). */
  audioLang?: string | null;
};

const DEFAULT_REMOTE_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Remux a remote HTTP(S) media URL into browser HLS.
 * Prefer stream-copy (fast, stable for RealDebrid). Headers via FFmpeg `-headers`.
 */
export function buildRemoteHlsArgs(
  inputUrl: string,
  playlistFileName: string,
  options: RemoteHlsOptions = {}
): string[] {
  const args: string[] = ["-hide_banner", "-nostdin", "-y"];

  const headers: Record<string, string> = {
    "User-Agent": DEFAULT_REMOTE_UA,
    ...(options.headers ?? {}),
  };
  const headerBlock = Object.entries(headers)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\r\n")
    .concat("\r\n");
  args.push("-headers", headerBlock);
  args.push("-user_agent", headers["User-Agent"] ?? DEFAULT_REMOTE_UA);

  // Network inputs (live + VOD remux): reconnect across flaky CDN stalls.
  args.push(
    "-reconnect",
    "1",
    "-reconnect_streamed",
    "1",
    "-reconnect_on_network_error",
    "1",
    "-reconnect_delay_max",
    "5"
  );

  // Live sports CDNs often disguise MPEG-TS segments as `.txt` (or similar).
  // FFmpeg's HLS demuxer rejects those by default → exit 183 / "Invalid data".
  args.push(
    "-allowed_extensions",
    "ALL",
    "-allowed_segment_extensions",
    "ALL",
    "-extension_picky",
    "0"
  );

  args.push(
    "-i",
    inputUrl,
    ...hlsRemuxTail(playlistFileName, {
      live: Boolean(options.live),
      audioLang: options.audioLang ?? null,
    })
  );
  return args;
}

/** Local-file path: re-encode to browser-safe H264/AAC HLS. */
function hlsTranscodeTail(playlistFileName: string, opts: { live: boolean }): string[] {
  const tail = [
    "-map",
    "0:v:0?",
    "-map",
    "0:a:0?",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-profile:v",
    "baseline",
    "-level",
    "3.1",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ac",
    "2",
    "-f",
    "hls",
    "-hls_time",
    "2",
    "-hls_segment_filename",
    "seg_%03d.ts",
  ];

  if (opts.live) {
    return [
      ...tail,
      "-hls_list_size",
      "6",
      "-hls_flags",
      "delete_segments+append_list",
      playlistFileName,
    ];
  }

  return [
    ...tail,
    "-hls_list_size",
    "0",
    "-hls_playlist_type",
    "vod",
    playlistFileName,
  ];
}

/**
 * Fast remux for browser HLS: copy video, always re-encode audio to AAC.
 * Many RealDebrid files ship AC3/E-AC3/DTS — stream-copy keeps picture but
 * Chrome/hls.js plays silence. AAC stereo is universally playable.
 *
 * When `audioLang` is set (ISO 639-2), map that tagged track if present,
 * otherwise fall back to the first audio stream.
 */
function hlsRemuxTail(
  playlistFileName: string,
  opts: { live: boolean; audioLang?: string | null }
): string[] {
  const prefer =
    opts.audioLang && /^[a-z]{3}$/i.test(opts.audioLang)
      ? opts.audioLang.toLowerCase()
      : null;

  const tail = [
    "-map",
    "0:v:0?",
    // Prefer tagged language (optional); always fall back to first audio.
    // Player uses the first mapped audio track.
    ...(prefer ? ["-map", `0:a:m:language:${prefer}?`] : []),
    "-map",
    "0:a:0?",
    "-c:v",
    "copy",
    "-bsf:v",
    "h264_mp4toannexb",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-ac",
    "2",
    "-ar",
    "48000",
    "-f",
    "hls",
    "-hls_time",
    "4",
    "-hls_segment_filename",
    "seg_%03d.ts",
  ];

  if (opts.live) {
    return [
      ...tail,
      "-hls_list_size",
      "6",
      "-hls_flags",
      "delete_segments+append_list",
      playlistFileName,
    ];
  }

  // Growing VOD playlist (no ENDLIST until FFmpeg finishes) so the browser can
  // start while remux continues. Avoids killing long remuxes with a short watchdog.
  return [
    ...tail,
    "-hls_list_size",
    "0",
    "-hls_playlist_type",
    "event",
    playlistFileName,
  ];
}

/** Only http(s) URLs; rejects credentials-in-URL and non-http schemes. */
export function assertRemoteMediaUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw Object.assign(new Error("Invalid media URL"), { code: "VALIDATION_ERROR" });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw Object.assign(new Error("Only http(s) media URLs are allowed"), {
      code: "VALIDATION_ERROR",
    });
  }
  if (url.username || url.password) {
    throw Object.assign(new Error("Media URLs with embedded credentials are not allowed"), {
      code: "VALIDATION_ERROR",
    });
  }
  return url;
}

export async function waitForFile(
  filePath: string,
  timeoutMs: number,
  pollMs = 100
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await access(filePath, constants.R_OK);
      log.debug(`File ready: ${filePath}`);
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, pollMs));
    }
  }
  return false;
}
