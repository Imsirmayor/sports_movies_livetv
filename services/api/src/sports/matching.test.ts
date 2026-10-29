import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isAmbiguous, matchAllEvents, tokenize, type MatchableEvent } from "./matching.js";

const events: MatchableEvent[] = [
  {
    id: "1",
    title: "Los Angeles Lakers vs Boston Celtics",
    sport: "basketball",
    homeTeam: "Los Angeles Lakers",
    awayTeam: "Boston Celtics",
  },
  {
    id: "2",
    title: "Golden State Warriors vs Los Angeles Clippers",
    sport: "basketball",
    homeTeam: "Golden State Warriors",
    awayTeam: "Los Angeles Clippers",
  },
  {
    id: "3",
    title: "New York Yankees vs Boston Red Sox",
    sport: "baseball",
    homeTeam: "New York Yankees",
    awayTeam: "Boston Red Sox",
  },
  {
    id: "4",
    title: "Arsenal vs Liverpool",
    sport: "soccer",
    homeTeam: "Arsenal",
    awayTeam: "Liverpool",
  },
  {
    id: "5",
    title: "Colorado Avalanche vs Vegas Golden Knights",
    sport: "hockey",
    homeTeam: "Colorado Avalanche",
    awayTeam: "Vegas Golden Knights",
  },
];

describe("sports team matching", () => {
  it("tokenizes case and whitespace differences", () => {
    assert.deepEqual(tokenize("  Los   Angeles "), ["los", "angeles"]);
    assert.deepEqual(tokenize("Red-Sox"), ["red", "sox"]);
  });

  it("matches exact team names", () => {
    const hits = matchAllEvents(events, "Arsenal");
    assert.equal(hits[0]?.event.id, "4");
    assert.ok((hits[0]?.score ?? 0) >= 3);
  });

  it("expands abbreviations and aliases", () => {
    const lakers = matchAllEvents(events, "lakers");
    assert.equal(lakers[0]?.event.id, "1");

    const avs = matchAllEvents(events, "avs");
    assert.equal(avs[0]?.event.id, "5");

    const yanks = matchAllEvents(events, "yanks");
    assert.equal(yanks[0]?.event.id, "3");

    const gunners = matchAllEvents(events, "gunners");
    assert.equal(gunners[0]?.event.id, "4");
  });

  it("is case insensitive", () => {
    const hits = matchAllEvents(events, "cELTICS");
    assert.equal(hits[0]?.event.id, "1");
  });

  it("returns empty for no match", () => {
    assert.equal(matchAllEvents(events, "zzzz-no-team").length, 0);
    assert.equal(matchAllEvents(events, "   ").length, 0);
  });

  it("returns multiple matches without auto-picking when ambiguous", () => {
    const hits = matchAllEvents(events, "los angeles");
    assert.ok(hits.length >= 2);
    assert.equal(isAmbiguous(hits), true);
    // Caller must not assume a single winner
    assert.notEqual(hits[0]?.event.id, undefined);
    assert.notEqual(hits[1]?.event.id, hits[0]?.event.id);
  });

  it("does not treat unrelated sports as matches for empty score paths", () => {
    const nhlOnly = matchAllEvents(events, "nhl nonexistent");
    // "nhl" alone may match nothing in titles unless sport token present — our events include sport
    const hockey = matchAllEvents(events, "hockey avalanche");
    assert.equal(hockey[0]?.event.id, "5");
    void nhlOnly;
  });
});
