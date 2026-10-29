import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatMatchupTitle, parseMatchupFromSlug } from "./matchup.js";

describe("parseMatchupFromSlug", () => {
  it("splits two single-word clubs", () => {
    const m = parseMatchupFromSlug("sevilla-osasuna");
    assert.equal(m.title, "Sevilla vs Osasuna");
    assert.equal(m.homeTeam, "Sevilla");
    assert.equal(m.awayTeam, "Osasuna");
  });

  it("splits even multi-word NBA matchups", () => {
    const m = parseMatchupFromSlug("washington-wizards-charlotte-hornets");
    assert.equal(m.title, "Washington Wizards vs Charlotte Hornets");
    assert.equal(m.homeTeam, "Washington Wizards");
    assert.equal(m.awayTeam, "Charlotte Hornets");
  });

  it("handles uneven NHL city names via known teams", () => {
    const m = parseMatchupFromSlug("new-york-rangers-los-angeles-kings");
    assert.equal(m.title, "New York Rangers vs Los Angeles Kings");
    assert.equal(m.homeTeam, "New York Rangers");
    assert.equal(m.awayTeam, "Los Angeles Kings");
  });

  it("handles Real Madrid vs FC Barcelona", () => {
    const m = parseMatchupFromSlug("real-madrid-fc-barcelona");
    assert.equal(m.title, "Real Madrid vs FC Barcelona");
    assert.equal(m.homeTeam, "Real Madrid");
    assert.equal(m.awayTeam, "FC Barcelona");
  });

  it("respects explicit -vs- delimiter", () => {
    const m = parseMatchupFromSlug("arsenal-vs-liverpool");
    assert.equal(m.title, "Arsenal vs Liverpool");
  });

  it("formats title from home/away when present", () => {
    assert.equal(
      formatMatchupTitle("Mash", "Arsenal", "Liverpool"),
      "Arsenal vs Liverpool"
    );
  });
});
