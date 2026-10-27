import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StreamCache, movieCacheKey, seriesCacheKey } from "./stream-cache.js";

describe("StreamCache", () => {
  let root: string;

  before(async () => {
    root = await mkdtemp(join(tmpdir(), "fr-cache-"));
  });

  after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("builds stable keys", () => {
    assert.equal(movieCacheKey("tt123", 0), "movie_tt123_s0_a2");
    assert.equal(seriesCacheKey("tt9", 1, 2, 3), "series_tt9_S1E2_s3_a2");
  });

  it("saves and detects cached HLS", async () => {
    const cache = new StreamCache(root, 5);
    await cache.init();
    const key = movieCacheKey("tt0111161", 0);
    assert.equal(await cache.has(key), false);

    const src = join(root, "src-job");
    await mkdir(src, { recursive: true });
    await writeFile(
      join(src, "index.m3u8"),
      "#EXTM3U\n#EXTINF:4,\nseg_000.ts\n#EXT-X-ENDLIST\n"
    );
    await writeFile(join(src, "seg_000.ts"), "fake");

    await cache.save(key, "tt0111161", src);
    assert.equal(await cache.has(key), true);
    assert.ok(await cache.getPlaylistPath(key));
  });

  it("refuses incomplete EVENT playlists without ENDLIST", async () => {
    const cache = new StreamCache(root, 5);
    await cache.init();
    const key = movieCacheKey("ttIncomplete", 0);
    const src = join(root, "src-incomplete");
    await mkdir(src, { recursive: true });
    await writeFile(join(src, "index.m3u8"), "#EXTM3U\n#EXT-X-PLAYLIST-TYPE:EVENT\n#EXTINF:4,\nseg_000.ts\n");
    await writeFile(join(src, "seg_000.ts"), "fake");

    await cache.save(key, "ttIncomplete", src);
    assert.equal(await cache.has(key), false);
  });
});
