import type { SportEvent } from "@frankenstein/shared-types";
import { formatEventTitle } from "./format";

export function teamAbbr(name: string | null | undefined): string {
  if (!name?.trim()) return "—";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0]!.length <= 3
      ? parts[0]!.toUpperCase()
      : parts[0]!.slice(0, 3).toUpperCase();
  }
  return parts
    .slice(0, 3)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function eventScoreLabel(event: SportEvent): string | null {
  const home = event.score?.home;
  const away = event.score?.away;
  if (home == null || away == null) return null;
  const h = teamAbbr(event.homeTeam ?? "HOME");
  const a = teamAbbr(event.awayTeam ?? "AWAY");
  return `${h} ${home} : ${away} ${a}`;
}

export function eventSubtitle(event: SportEvent): string {
  const bits = [event.competition, event.sport].filter(Boolean);
  if (event.status === "live") bits.push("Live now");
  else if (event.status === "upcoming") bits.push("Upcoming");
  return bits.join(" · ");
}

export { formatEventTitle };
