import Link from "next/link";
import type { SportEvent } from "@frankenstein/shared-types";
import { formatEventTitle, formatScore } from "@/lib/format";
import { MatchCountdown } from "./MatchCountdown";

type Props = {
  event: SportEvent;
  /** When true, omit competition from the meta line (section already shows the league). */
  hideCompetition?: boolean;
};

function statusLabel(status: SportEvent["status"]): string {
  if (status === "live") return "LIVE";
  if (status === "upcoming") return "Upcoming";
  if (status === "finished") return "Finished";
  return "Unknown";
}

function availabilityLabel(a: SportEvent["streamAvailability"]): string {
  if (a === "fixture") return "Watch (fixture)";
  if (a === "available") return "Stream available";
  if (a === "provider_required") return "Provider required";
  return "No stream";
}

export function EventCard({ event, hideCompetition = false }: Props) {
  const score = formatScore(event.score);
  const playable =
    event.streamAvailability === "fixture" || event.streamAvailability === "available";

  return (
    <article className="event-card">
      <div className="event-card-badges">
        <span className={`badge status-${event.status}`}>{statusLabel(event.status)}</span>
        <span className={`badge avail-${event.streamAvailability}`}>
          {availabilityLabel(event.streamAvailability)}
        </span>
      </div>
      <p className="event-meta">
        {hideCompetition ? event.sport : `${event.competition} · ${event.sport}`}
      </p>
      <h3 className="event-title">{formatEventTitle(event)}</h3>
      <p className="event-sub">
        <MatchCountdown startTime={event.startTime} status={event.status} />
        {score ? ` · ${score}` : ""}
      </p>
      <Link
        href={`/sports/${encodeURIComponent(event.id)}`}
        className={playable ? "accent-btn" : "ghost-btn"}
      >
        {playable
          ? "Watch live"
          : event.status === "upcoming"
            ? "Scheduled"
            : "View details"}
      </Link>
    </article>
  );
}
