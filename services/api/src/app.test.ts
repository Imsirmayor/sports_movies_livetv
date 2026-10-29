import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import request from "supertest";
import { createApp, type AppContext } from "./app.js";
import { isProcessAlive } from "@frankenstein/media-worker";

const execFileAsync = promisify(execFile);
const TOKEN = "test-token-phase2";

async function generateSample(dir: string): Promise<void> {
  const out = join(dir, "sample.mp4");
  await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc=duration=2:size=320x240:rate=10",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=2",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      "-y",
      out,
    ],
    { timeout: 60_000 }
  );
}

describe("frankenstein API phase two", () => {
  let mediaRoot: string;
  let workRoot: string;
  let ctx: AppContext;
  let mediaId: string;

  before(async () => {
    mediaRoot = await mkdtemp(join(tmpdir(), "fr-media-"));
    workRoot = await mkdtemp(join(tmpdir(), "fr-work-"));
    await generateSample(mediaRoot);

    ctx = await createApp({
      port: 0,
      host: "127.0.0.1",
      apiToken: TOKEN,
      mediaRoot,
      workRoot,
      maxConcurrentJobs: 1,
      maxEdgeSessions: 24,
      jobTimeoutMs: 60_000,
      ffmpegBinary: "ffmpeg",
      sportsProvider: "fixture",
      sportsFixtureMediaId: null,
      stremioAddonUrl: null,
      maxResolution: 720,
      streamCacheRoot: null,
      streamCacheMaxEntries: 10,
      catalogWarmIntervalMs: 0,
      catalogWarmCount: 0,
      catalogWarmFullRemux: false,
      r2: null,
    });

    const list = await request(ctx.app)
      .get("/api/media")
      .set("Authorization", `Bearer ${TOKEN}`)
      .expect(200);
    assert.equal(list.body.items.length, 1);
    mediaId = list.body.items[0].id as string;
  });

  after(async () => {
    await ctx.shutdown();
    await rm(mediaRoot, { recursive: true, force: true });
    await rm(workRoot, { recursive: true, force: true });
  });

  it("GET /api/health returns ok", async () => {
    const res = await request(ctx.app).get("/api/health").expect(200);
    assert.equal(res.body.status, "ok");
    assert.equal(res.body.service, "frankenstein-api");
    assert.equal(res.body.ffmpegAvailable, true);
    assert.equal(res.body.mediaRootConfigured, true);
    assert.equal(res.body.sportsProvider, "fixture");
  });

  it("vod playback response includes kind and capabilities", async () => {
    const created = await request(ctx.app)
      .post("/api/playback")
      .set("Authorization", `Bearer ${TOKEN}`)
      .send({ mediaId })
      .expect(201);
    assert.equal(created.body.kind, "vod");
    assert.equal(created.body.capabilities.seek, true);
    await request(ctx.app)
      .delete(`/api/playback/${created.body.sessionId}`)
      .set("Authorization", `Bearer ${TOKEN}`)
      .expect(200);
  });

  it("rejects unauthenticated media requests", async () => {
    await request(ctx.app).get("/api/media").expect(401);
    await request(ctx.app).get("/api/media/search?q=sample").expect(401);
  });

  it("rejects invalid playback body", async () => {
    const res = await request(ctx.app)
      .post("/api/playback")
      .set("Authorization", `Bearer ${TOKEN}`)
      .send({})
      .expect(400);
    assert.equal(res.body.error.code, "VALIDATION_ERROR");
  });

  it("searches and fetches local sample media", async () => {
    const search = await request(ctx.app)
      .get("/api/media/search")
      .query({ q: "sample" })
      .set("Authorization", `Bearer ${TOKEN}`)
      .expect(200);
    assert.equal(search.body.items.length, 1);

    const one = await request(ctx.app)
      .get(`/api/media/${mediaId}`)
      .set("Authorization", `Bearer ${TOKEN}`)
      .expect(200);
    assert.equal(one.body.id, mediaId);
    assert.equal(one.body.filename, "sample.mp4");
    assert.equal(one.body.absolutePath, undefined);
  });

  it("returns 404 for unknown media id", async () => {
    await request(ctx.app)
      .get("/api/media/does-not-exist")
      .set("Authorization", `Bearer ${TOKEN}`)
      .expect(404);
  });

  it("creates playback, reports status, serves playlist, and stops without orphan ffmpeg", async () => {
    const created = await request(ctx.app)
      .post("/api/playback")
      .set("Authorization", `Bearer ${TOKEN}`)
      .send({ mediaId })
      .expect(201);

    assert.ok(created.body.sessionId);
    assert.ok(["starting", "ready"].includes(created.body.status));
    assert.ok(created.body.playlistUrl);

    const sessionId = created.body.sessionId as string;
    const pid = created.body.ffmpegPid as number | null;

    await request(ctx.app)
      .get(`/api/playback/${sessionId}`)
      .set("Authorization", `Bearer ${TOKEN}`)
      .expect(200);

    let playlistReady = false;
    for (let i = 0; i < 50; i++) {
      const st = await request(ctx.app)
        .get(`/api/playback/${sessionId}`)
        .set("Authorization", `Bearer ${TOKEN}`);
      if (st.body.status === "ready") {
        playlistReady = true;
        break;
      }
      if (st.body.status === "failed") {
        assert.fail(`playback failed: ${st.body.errorMessage}`);
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.equal(playlistReady, true);

    const playlist = await request(ctx.app)
      .get(`/api/playback/${sessionId}/stream/index.m3u8`)
      .set("Authorization", `Bearer ${TOKEN}`)
      .expect(200);
    assert.match(playlist.text, /#EXTM3U/);

    await request(ctx.app)
      .get(`/api/playback/${sessionId}/stream/evil.txt`)
      .set("Authorization", `Bearer ${TOKEN}`)
      .expect(400);

    // seg_1000+ must be allowed (FFmpeg widens past %03d). Missing file → 404, not 400.
    await request(ctx.app)
      .get(`/api/playback/${sessionId}/stream/seg_1000.ts`)
      .set("Authorization", `Bearer ${TOKEN}`)
      .expect(404);

    const stopped = await request(ctx.app)
      .delete(`/api/playback/${sessionId}`)
      .set("Authorization", `Bearer ${TOKEN}`)
      .expect(200);
    assert.equal(stopped.body.status, "stopped");
    assert.equal(stopped.body.ffmpegPid, null);

    if (typeof pid === "number") {
      assert.equal(await isProcessAlive(pid), false);
    }
  });

  it("enforces concurrency limit", async () => {
    const first = await request(ctx.app)
      .post("/api/playback")
      .set("Authorization", `Bearer ${TOKEN}`)
      .send({ mediaId })
      .expect(201);

    const second = await request(ctx.app)
      .post("/api/playback")
      .set("Authorization", `Bearer ${TOKEN}`)
      .send({ mediaId })
      .expect(429);
    assert.equal(second.body.error.code, "CAPACITY");

    await request(ctx.app)
      .delete(`/api/playback/${first.body.sessionId}`)
      .set("Authorization", `Bearer ${TOKEN}`)
      .expect(200);
  });
});
