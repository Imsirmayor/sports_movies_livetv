import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isSaatZamanLive, parseEventUrl, toSportEvent, toSportsurgeRawEvent } from "./sportsurge.js";

describe("isSaatZamanLive", () => {
  it("detects btn-live class from StreamEast LIVE badge", () => {
    const classes =
      "f1-podium--time f1-label f1-bg--gray2 misc--label text-semi-bold  SaatZamanBilgisi  btn-live ";
    const inner = '<span style="color: #930f0d;font-weight:bold;">LIVE</span>';
    assert.equal(isSaatZamanLive(classes, inner), true);
  });

  it("detects LIVE text without btn-live", () => {
    assert.equal(isSaatZamanLive("SaatZamanBilgisi", "LIVE"), true);
  });

  it("ignores upcoming countdown labels", () => {
    assert.equal(
      isSaatZamanLive("SaatZamanBilgisi", "13 hours from now"),
      false
    );
  });
});

describe("LIVE stream unlock", () => {
  it("marks btn-live events available for immediate playback", () => {
    const raw = toSportsurgeRawEvent({
      url: "https://streameast.cool/stream/nascar-cup-series/nascar-cup-series-2026-yellawood-500-live-stream",
      title: "NASCAR Cup Series 2026 Yellawood 500",
      sport: "nascar-cup-series",
      startTime: new Date().toISOString(),
      status: "live",
    });
    const event = toSportEvent(raw);
    assert.equal(event.status, "live");
    assert.equal(event.streamAvailability, "available");
    assert.equal(parseEventUrl(raw.sourceUrl).kind, "stream");
  });
});
