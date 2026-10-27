import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { assertFileInsideRoot } from "./paths.js";
import {
  assertReadableFile,
  assertRemoteMediaUrl,
  buildHlsArgs,
  buildRemoteHlsArgs,
  waitForFile,
} from "./ffmpeg.js";
import { isProcessAlive, spawnTracked, type TrackedProcess } from "./process.js";
import { createLogger } from "./logger.js";

const log = createLogger("Jobs");

export type JobStatus = "starting" | "ready" | "failed" | "stopped";

export interface MediaJob {
  jobId: string;
  mediaRoot: string;
  inputAbsolutePath: string;
  /** Remote source URL when job is URL-backed (never returned to clients). */
  inputUrl: string | null;
  /** Absolute https playlist (e.g. R2 CDN) — player loads directly; no local segments. */
  externalPlaylistUrl: string | null;
  /** true = FFmpeg remux/transcode (counts against maxConcurrentJobs). */
  heavy: boolean;
  outputDir: string;
  playlistPath: string;
  status: JobStatus;
  pid: number | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobManagerOptions {
  mediaRoot: string;
  workRoot: string;
  ffmpegBinary?: string;
  maxConcurrentJobs?: number;
  /** Cached / CDN edge sessions (no FFmpeg). Default 24. */
  maxEdgeSessions?: number;
  jobTimeoutMs?: number;
  playlistReadyTimeoutMs?: number;
}

export class JobManager {
  private readonly mediaRoot: string;
  private readonly workRoot: string;
  private readonly ffmpegBinary: string;
  private readonly maxConcurrentJobs: number;
  private readonly maxEdgeSessions: number;
  private readonly jobTimeoutMs: number;
  private readonly playlistReadyTimeoutMs: number;
  private readonly jobs = new Map<string, MediaJob>();
  private readonly tracked = new Map<string, TrackedProcess>();
  private readonly onCompleteHandlers = new Map<
    string,
    (job: MediaJob, exitCode: number | null) => void | Promise<void>
  >();
  private shuttingDown = false;

  constructor(options: JobManagerOptions) {
    this.mediaRoot = options.mediaRoot;
    this.workRoot = options.workRoot;
    this.ffmpegBinary = options.ffmpegBinary ?? "ffmpeg";
    this.maxConcurrentJobs = options.maxConcurrentJobs ?? 1;
    this.maxEdgeSessions = options.maxEdgeSessions ?? 24;
    this.jobTimeoutMs = options.jobTimeoutMs ?? 120_000;
    this.playlistReadyTimeoutMs = options.playlistReadyTimeoutMs ?? 30_000;
  }

  /**
   * Delete leftover remux dirs from crashed / kill -9 runs.
   * Safe at boot when no jobs are active yet. Prevents MEDIA_WORK_ROOT disk floods.
   */
  async purgeOrphanWorkDirs(): Promise<number> {
    let removed = 0;
    let entries: string[];
    try {
      entries = await readdir(this.workRoot);
    } catch {
      return 0;
    }
    for (const name of entries) {
      if (this.jobs.has(name)) continue;
      const path = join(this.workRoot, name);
      try {
        const st = await stat(path);
        if (!st.isDirectory()) continue;
        await rm(path, { recursive: true, force: true });
        removed += 1;
      } catch (err) {
        log.warn(
          `orphan purge failed path=${path}: ${err instanceof Error ? err.message : err}`
        );
      }
    }
    if (removed > 0) {
      log.info(`Purged ${removed} orphan remux dir(s) under ${this.workRoot}`);
    }
    return removed;
  }

  /** All active sessions (heavy + edge). */
  getActiveCount(): number {
    let n = 0;
    for (const job of this.jobs.values()) {
      if (job.status === "starting" || job.status === "ready") n++;
    }
    return n;
  }

  /** FFmpeg remux/transcode jobs only (warmers should respect this). */
  getHeavyActiveCount(): number {
    let n = 0;
    for (const job of this.jobs.values()) {
      if ((job.status === "starting" || job.status === "ready") && job.heavy) n++;
    }
    return n;
  }

  private assertHeavyCapacity(): void {
    if (this.getHeavyActiveCount() >= this.maxConcurrentJobs) {
      const err = new Error("Maximum concurrent playback sessions");
      (err as Error & { code?: string }).code = "CAPACITY";
      throw err;
    }
  }

  private assertEdgeCapacity(): void {
    let edge = 0;
    for (const job of this.jobs.values()) {
      if ((job.status === "starting" || job.status === "ready") && !job.heavy) edge++;
    }
    if (edge >= this.maxEdgeSessions) {
      const err = new Error("Maximum concurrent edge playback sessions");
      (err as Error & { code?: string }).code = "CAPACITY";
      throw err;
    }
  }

  getJob(jobId: string): MediaJob | undefined {
    return this.jobs.get(jobId);
  }

  async startHlsJob(jobId: string, inputAbsolutePath: string): Promise<MediaJob> {
    if (this.shuttingDown) {
      throw new Error("Job manager is shutting down");
    }
    this.assertHeavyCapacity();

    const safeInput = assertFileInsideRoot(this.mediaRoot, inputAbsolutePath);
    await assertReadableFile(safeInput);

    const outputDir = join(this.workRoot, jobId);
    const playlistPath = join(outputDir, "index.m3u8");
    await mkdir(outputDir, { recursive: true });

    const now = new Date().toISOString();
    const job: MediaJob = {
      jobId,
      mediaRoot: this.mediaRoot,
      inputAbsolutePath: safeInput,
      inputUrl: null,
      externalPlaylistUrl: null,
      heavy: true,
      outputDir,
      playlistPath,
      status: "starting",
      pid: null,
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(jobId, job);

    return this.launch(jobId, buildHlsArgs(safeInput, "index.m3u8"), this.jobTimeoutMs);
  }

  /**
   * Serve a previously cached HLS directory without running FFmpeg.
   */
  async startCachedHlsJob(jobId: string, cacheDir: string): Promise<MediaJob> {
    if (this.shuttingDown) {
      throw new Error("Job manager is shutting down");
    }
    this.assertEdgeCapacity();

    const outputDir = join(this.workRoot, jobId);
    const playlistPath = join(outputDir, "index.m3u8");
    await rm(outputDir, { recursive: true, force: true });
    await cp(cacheDir, outputDir, { recursive: true });
    await assertReadableFile(playlistPath);

    const now = new Date().toISOString();
    const job: MediaJob = {
      jobId,
      mediaRoot: this.mediaRoot,
      inputAbsolutePath: cacheDir,
      inputUrl: null,
      externalPlaylistUrl: null,
      heavy: false,
      outputDir,
      playlistPath,
      status: "ready",
      pid: null,
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(jobId, job);
    log.info(`Cached HLS ready job=${jobId}`);
    return job;
  }

  /**
   * CDN / R2 playlist — browser loads HTTPS playlist directly (CORS must allow it).
   * Does not use an FFmpeg slot.
   */
  async startExternalHlsJob(jobId: string, playlistUrl: string): Promise<MediaJob> {
    if (this.shuttingDown) {
      throw new Error("Job manager is shutting down");
    }
    this.assertEdgeCapacity();
    const url = assertRemoteMediaUrl(playlistUrl);
    const now = new Date().toISOString();
    const job: MediaJob = {
      jobId,
      mediaRoot: this.mediaRoot,
      inputAbsolutePath: "",
      inputUrl: null,
      externalPlaylistUrl: url.toString(),
      heavy: false,
      outputDir: "",
      playlistPath: "",
      status: "ready",
      pid: null,
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(jobId, job);
    log.info(`External HLS ready job=${jobId}`);
    return job;
  }

  /**
   * Start an HLS job from a remote http(s) URL (sports live / torrentio VOD).
   * Live jobs disable the process timeout so FFmpeg can run until stopped.
   */
  async startRemoteHlsJob(
    jobId: string,
    inputUrl: string,
    options: {
      live?: boolean;
      headers?: Record<string, string>;
      audioLang?: string | null;
      /** Called when FFmpeg exits (after status update). */
      onComplete?: (job: MediaJob, exitCode: number | null) => void | Promise<void>;
    } = {}
  ): Promise<MediaJob> {
    if (this.shuttingDown) {
      throw new Error("Job manager is shutting down");
    }
    this.assertHeavyCapacity();

    const url = assertRemoteMediaUrl(inputUrl);
    const outputDir = join(this.workRoot, jobId);
    const playlistPath = join(outputDir, "index.m3u8");
    await mkdir(outputDir, { recursive: true });

    const now = new Date().toISOString();
    const job: MediaJob = {
      jobId,
      mediaRoot: this.mediaRoot,
      inputAbsolutePath: "",
      inputUrl: url.toString(),
      externalPlaylistUrl: null,
      heavy: true,
      outputDir,
      playlistPath,
      status: "starting",
      pid: null,
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(jobId, job);
    if (options.onComplete) {
      this.onCompleteHandlers.set(jobId, options.onComplete);
    }

    const args = buildRemoteHlsArgs(url.toString(), "index.m3u8", {
      live: options.live,
      headers: options.headers,
      audioLang: options.audioLang,
    });
    // Remote remux (live or catalog VOD) can run for the whole title — no watchdog kill.
    const timeoutMs = 0;
    // First playlist segment can take a while on cold RealDebrid links.
    return this.launch(jobId, args, timeoutMs, 120_000);
  }

  private async launch(
    jobId: string,
    args: string[],
    timeoutMs: number,
    playlistReadyTimeoutMs = this.playlistReadyTimeoutMs
  ): Promise<MediaJob> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error("Job missing before launch");

    let tracked: TrackedProcess;
    try {
      tracked = spawnTracked({
        command: this.ffmpegBinary,
        args,
        cwd: job.outputDir,
        timeoutMs,
        onStderr: (chunk) => {
          const trimmed = chunk.trim();
          if (trimmed) log.debug(`ffmpeg[${jobId}]: ${trimmed.slice(0, 200)}`);
        },
      });
    } catch (err) {
      job.status = "failed";
      job.errorMessage = err instanceof Error ? err.message : String(err);
      job.updatedAt = new Date().toISOString();
      throw err;
    }

    job.pid = tracked.pid;
    job.updatedAt = new Date().toISOString();
    this.tracked.set(jobId, tracked);

    void this.monitorJob(jobId, tracked);

    const ready = await waitForFile(job.playlistPath, playlistReadyTimeoutMs);
    const current = this.jobs.get(jobId);
    if (!current) {
      throw new Error("Job disappeared during start");
    }
    if (current.status === "failed" || current.status === "stopped") {
      return current;
    }
    if (ready) {
      current.status = "ready";
      current.updatedAt = new Date().toISOString();
      log.info(`HLS playlist ready for job=${jobId}`);
    } else {
      current.status = "failed";
      current.errorMessage = "Timed out waiting for HLS playlist";
      current.updatedAt = new Date().toISOString();
      await this.stopJob(jobId);
    }

    return current;
  }

  private async monitorJob(jobId: string, tracked: TrackedProcess): Promise<void> {
    const result = await tracked.exit;
    const job = this.jobs.get(jobId);
    if (!job) {
      this.tracked.delete(jobId);
      return;
    }

    // stopJob may have marked the job stopped while we awaited exit.
    if (job.status === "stopped") {
      this.tracked.delete(jobId);
      return;
    }

    if (result.code === 0) {
      if (job.status === "starting") {
        job.status = "ready";
      }
      job.pid = null;
      job.updatedAt = new Date().toISOString();
      log.info(`FFmpeg completed successfully job=${jobId}`);
    } else if (job.status === "ready") {
      // Remux already produced a playable playlist; keep serving it instead of
      // yanking the player mid-watch (common on flaky CDN disconnects).
      job.pid = null;
      job.updatedAt = new Date().toISOString();
      job.errorMessage = `FFmpeg exited early (code=${result.code}); playlist kept for playback`;
      log.warn(`FFmpeg exited after ready job=${jobId} code=${result.code} — keeping playlist`);
    } else {
      job.status = "failed";
      job.errorMessage = `FFmpeg exited with code=${result.code} signal=${result.signal}`;
      job.pid = null;
      job.updatedAt = new Date().toISOString();
      log.error(`FFmpeg failed job=${jobId}: ${job.errorMessage}`);
    }
    this.tracked.delete(jobId);

    const onComplete = this.onCompleteHandlers.get(jobId);
    this.onCompleteHandlers.delete(jobId);
    if (onComplete) {
      try {
        await onComplete(job, result.code);
      } catch (err) {
        log.warn(
          `onComplete handler failed job=${jobId}: ${err instanceof Error ? err.message : err}`
        );
      }
    }
  }

  async stopJob(jobId: string): Promise<MediaJob | undefined> {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;

    const tracked = this.tracked.get(jobId);
    if (tracked) {
      await tracked.kill();
      this.tracked.delete(jobId);
    } else if (job.pid !== null) {
      const { killTracked } = await import("./process.js");
      try {
        await killTracked(job.pid);
      } catch (err) {
        log.error(`stopJob cleanup error: ${err instanceof Error ? err.message : err}`);
      }
    }

    if (job.pid !== null) {
      const alive = await isProcessAlive(job.pid);
      if (alive) {
        throw new Error(`FFmpeg pid=${job.pid} still alive after stop`);
      }
    }

    job.status = "stopped";
    job.pid = null;
    job.updatedAt = new Date().toISOString();

    if (job.outputDir) {
      try {
        await rm(job.outputDir, { recursive: true, force: true });
      } catch (err) {
        log.warn(
          `Failed to remove output dir for job=${jobId}: ${err instanceof Error ? err.message : err}`
        );
      }
    }

    return job;
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    const ids = [...this.jobs.keys()];
    for (const id of ids) {
      const job = this.jobs.get(id);
      if (!job) continue;
      if (job.status === "starting" || job.status === "ready") {
        try {
          await this.stopJob(id);
        } catch (err) {
          log.error(`shutdown stop failed for ${id}: ${err instanceof Error ? err.message : err}`);
        }
      }
    }
  }
}
