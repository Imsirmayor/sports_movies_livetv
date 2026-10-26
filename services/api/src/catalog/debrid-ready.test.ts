import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isDebridCachedHint } from "./debrid-ready.js";

describe("isDebridCachedHint", () => {
  it("detects RD+ and lightning-bolt cached markers", () => {
    assert.equal(isDebridCachedHint("[RD+] 1080p"), true);
    assert.equal(isDebridCachedHint("Torrentio", "⚡ 720p BluRay"), true);
    assert.equal(isDebridCachedHint("RD download", "Cached on Real-Debrid"), true);
  });

  it("treats plain RD download names as not cached", () => {
    assert.equal(isDebridCachedHint("[RD] 1080p"), false);
    assert.equal(isDebridCachedHint("[RD download] 720p"), false);
  });
});
