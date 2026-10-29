import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { EventCard } from "./EventCard";
import type { SportEvent } from "@frankenstein/shared-types";

afterEach(() => cleanup());

const base: SportEvent = {
  id: "evt-nfl-live-1",
  sport: "football",
  competition: "NFL",
  competitionId: "comp-nfl",
  title: "Kansas City Chiefs vs Buffalo Bills",
  homeTeam: "Kansas City Chiefs",
  awayTeam: "Buffalo Bills",
  startTime: "2026-10-25T17:00:00.000Z",
  status: "live",
  score: { home: 17, away: 14 },
  provider: "fixture",
  streamAvailability: "available",
};

describe("EventCard", () => {
  it("renders event fields without inventing data", () => {
    render(<EventCard event={base} />);
    expect(screen.getByText("LIVE")).toBeInTheDocument();
    expect(screen.getByText(/Kansas City Chiefs vs Buffalo Bills/)).toBeInTheDocument();
    expect(screen.getByText(/17 – 14/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open event/i })).toHaveAttribute(
      "href",
      "/sports/evt-nfl-live-1"
    );
  });

  it("shows view details when stream is unavailable", () => {
    render(<EventCard event={{ ...base, streamAvailability: "unavailable", score: null }} />);
    expect(screen.getByRole("link", { name: /View details/i })).toBeInTheDocument();
    expect(screen.queryByText(/17 – 14/)).not.toBeInTheDocument();
  });
});
