import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import request from "supertest";
import { createApp, type AppContext } from "../app.js";
const execFileAsync = promisify(execFile);
const TOKEN = "test-token-sports";

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

describe("sports API phase 2B", () => {
  let mediaRoot: string;
  let workRoot: string;
  let ctx: AppContext;

  before(async () => {
    mediaRoot = await mkdtemp(join(tmpdir(), "fr-sports-media-"));
    workRoot = await mkdtemp(join(tmpdir(), "fr-sports-work-"));
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
  });

  after(async () => {
    await ctx.shutdown();
    await rm(mediaRoot, { recursive: true, force: true });
    await rm(workRoot, { recursive: true, force: true });
  });

  it("lists sports and competitions from fixture provider", async () => {
    const res = await request(ctx.app)
      .get("/api/sports")
      .set("Authorization", `Bearer ${TOKEN}`)
      .expect(200);
    assert.equal(res.body.provider, "fixture");
    assert.equal(res.body.providerConfigured, true);
    assert.ok(res.body.sports.includes("soccer"));
    assert.ok(res.body.competitions.length > 0);
  });

  it("rejects invalid status filter", async () => {
    const res = await request(ctx.app)
      .get("/api/sports/events")
      .query({ status: "halfway" })
      .set("Authorization", `Bearer ${TOKEN}`)
      .expect(400);
    assert.equal(res.body.error.code, "VALIDATION_ERROR");
  });

  it("filters live events and searches by team alias", async () => {
    const live = await request(ctx.app)
      .get("/api/sports/events")
      .query({ status: "live" })
      .set("Authorization", `Bearer ${TOKEN}`)
      .expect(200);
    assert.ok(live.body.events.every((e: { status: string }) => e.status === "live"));

    const alias = await request(ctx.app)
      .get("/api/sports/events")
      .query({ team: "gunners" })
      .set("Authorization", `Bearer ${TOKEN}`)
      .expect(200);
    assert.ok(alias.body.events.some((e: { homeTeam: string }) => e.homeTeam === "Arsenal"));
  });

  it("flags ambiguous team searches without auto-selecting", async () => {
    const res = await request(ctx.app)
      .get("/api/sports/events")
      .query({ team: "los angeles" })
      .set("Authorization", `Bearer ${TOKEN}`)
      .expect(200);
    assert.equal(res.body.ambiguous, true);
    assert.ok(res.body.events.length >= 2);
    assert.ok(Array.isArray(res.body.matchScores));
  });

  it("returns event details and lists soccer leagues separately", async () => {
    const res = await request(ctx.app)
      .get("/api/sports/events/evt-epl-live-1")
      .set("Authorization", `Bearer ${TOKEN}`)
      .expect(200);
    assert.equal(res.body.id, "evt-epl-live-1");
    assert.equal(res.body.competition, "Premier League");
    assert.equal(res.body.streamAvailability, "unavailable");

    const list = await request(ctx.app)
      .get("/api/sports")
      .set("Authorization", `Bearer ${TOKEN}`)
      .expect(200);
    const names = (list.body.competitions as Array<{ name: string }>).map((c) => c.name);
    assert.ok(names.includes("Premier League"));
    assert.ok(names.includes("La Liga"));
    assert.ok(names.includes("FIFA World Cup"));
  });

  it("filters events by competition name", async () => {
    const res = await request(ctx.app)
      .get("/api/sports/events")
      .query({ competition: "La Liga" })
      .set("Authorization", `Bearer ${TOKEN}`)
      .expect(200);
    assert.ok(res.body.events.length >= 1);
    assert.ok(
      res.body.events.every((e: { competition: string }) => e.competition === "La Liga")
    );
  });

  it("refuses live playback when stream is unavailable", async () => {
    const res = await request(ctx.app)
      .post("/api/sports/playback")
      .set("Authorization", `Bearer ${TOKEN}`)
      .send({ eventId: "evt-epl-live-1" })
      .expect(409);
    assert.equal(res.body.error.code, "STREAM_UNAVAILABLE");
  });
});

describe("sports provider none", () => {
  let mediaRoot: string;
  let workRoot: string;
  let ctx: AppContext;

  before(async () => {
    mediaRoot = await mkdtemp(join(tmpdir(), "fr-sports-none-"));
    workRoot = await mkdtemp(join(tmpdir(), "fr-sports-none-work-"));
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
      sportsProvider: "none",
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
  });

  after(async () => {
    await ctx.shutdown();
    await rm(mediaRoot, { recursive: true, force: true });
    await rm(workRoot, { recursive: true, force: true });
  });

  it("reports provider unavailable for event search", async () => {
    const res = await request(ctx.app)
      .get("/api/sports/events")
      .set("Authorization", `Bearer ${TOKEN}`)
      .expect(503);
    assert.equal(res.body.error.code, "PROVIDER_UNAVAILABLE");
  });
});
