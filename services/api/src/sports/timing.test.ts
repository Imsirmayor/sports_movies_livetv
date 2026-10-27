import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseRelativeCountdownMs, resolveMatchTiming } from "./timing.js";

describe("parseRelativeCountdownMs", () => {
  it("parses hours from now", () => {
    assert.equal(parseRelativeCountdownMs("13 hours from now"), 13 * 3_600_000);
    assert.equal(parseRelativeCountdownMs("9 hours from now"), 9 * 3_600_000);
  });

  it("parses minutes from now", () => {
    assert.equal(parseRelativeCountdownMs("45 minutes from now"), 45 * 60_000);
  });

  it("treats LIVE as zero", () => {
    assert.equal(parseRelativeCountdownMs("LIVE"), 0);
    assert.equal(parseRelativeCountdownMs('<span style="color:#930f0d">LIVE</span>'), 0);
  });
});

describe("resolveMatchTiming", () => {
  const now = Date.parse("2026-10-26T10:00:00.000Z");

  it("marks btn-live as live", () => {
    const t = resolveMatchTiming({
      btnLive: true,
      dataZaman: 1_640_451_600,
      label: "LIVE",
      nowMs: now,
    });
    assert.equal(t.status, "live");
    assert.equal(t.isLive, true);
  });

  it("ignores placeholder data-zaman and uses label", () => {
    const t = resolveMatchTiming({
      dataZaman: 1_640_451_600,
      label: "13 hours from now",
      nowMs: now,
    });
    assert.equal(t.status, "upcoming");
    assert.equal(t.startTime, new Date(now + 13 * 3_600_000).toISOString());
  });

  it("trusts a plausible unix data-zaman", () => {
    const startSec = Math.floor(now / 1000) + 3600;
    const t = resolveMatchTiming({
      dataZaman: startSec,
      label: "soon",
      nowMs: now,
    });
    assert.equal(t.status, "upcoming");
    assert.equal(t.startTime, new Date(startSec * 1000).toISOString());
  });
});
