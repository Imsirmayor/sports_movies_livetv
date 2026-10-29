import type { SportCompetition, SportEvent } from "@frankenstein/shared-types";
import {
  fetchEvents,
  toSportEvent,
  toSportsurgeRawEvent,
  type SportsurgeRawEvent,
} from "./sportsurge.js";

/** Build the catalog from current Sportsurge listings. */
export async function buildFixtureCatalog(): Promise<{
  sports: string[];
  competitions: SportCompetition[];
  events: SportEvent[];
  raw: SportsurgeRawEvent[];
}> {
  const raw = (await fetchEvents()).map(toSportsurgeRawEvent);
  const events = raw.map(toSportEvent);
  const sports = [...new Set(events.map((event) => event.sport))].sort();
  const competitions = sports.map((sport) => ({
    id: `ss-comp-${sport}`,
    name: sport.toUpperCase(),
    sport,
  }));

  return { sports, competitions, events, raw };
}
