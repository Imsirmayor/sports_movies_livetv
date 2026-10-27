"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SportEvent } from "@frankenstein/shared-types";
import { SiteShell } from "./SiteShell";
import { StateBlock } from "./StateBlock";
import { apiClient } from "@/lib/api-client";
import { isApiClientError } from "@/lib/api-error";
import { formatStartTime } from "@/lib/format";
import { MatchCountdown } from "./MatchCountdown";
import {
  eventScoreLabel,
  eventSubtitle,
  formatEventTitle,
  teamAbbr,
} from "@/lib/sports-ui";

type Props = { eventId: string };

export function SportEventDetail({ eventId }: Props) {
  const router = useRouter();
  const [event, setEvent] = useState<SportEvent | null>(null);
  const [related, setRelated] = useState<SportEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [playError, setPlayError] = useState<string | null>(null);
  const [iframeSrc, setIframeSrc] = useState<string | null>(null);
  const [iframeReady, setIframeReady] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [tab, setTab] = useState<"timeline" | "stats" | "lineups">("timeline");
  const [cinemaMode, setCinemaMode] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [e, feed] = await Promise.all([
          apiClient.getSportEvent(eventId),
          apiClient.searchSportsEvents({}).catch(() => null),
        ]);
        if (cancelled) return;
        setEvent(e);
        setRelated(
          (feed?.events ?? [])
            .filter((x) => x.id !== e.id)
            .slice(0, 6)
        );
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setEvent(null);
          setError(isApiClientError(err) ? err.message : "Event not found");
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (ev.origin !== window.location.origin) return;
      const data = ev.data as { type?: string; sessionId?: string; active?: boolean } | null;
      if (data?.type === "frankenstein:cinema-mode") {
        setCinemaMode(Boolean(data.active));
        return;
      }
      if (data?.type === "frankenstein:watch-stopped" && data.sessionId === sessionId) {
        setIframeSrc(null);
        setIframeReady(false);
        setSessionId(null);
        setCinemaMode(false);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [sessionId]);

  useEffect(() => {
    return () => {
      if (sessionId) {
        void apiClient.stopPlayback(sessionId).catch(() => undefined);
      }
    };
  }, [sessionId]);

  async function startWatch() {
    if (!event) return;
    setBusy(true);
    setPlayError(null);
    setIframeReady(false);

    try {
      if (sessionId) {
        void apiClient.stopPlayback(sessionId).catch(() => undefined);
      }

      const session = await apiClient.startSportsPlayback(event.id, {
        timeoutMs: 180_000,
      });
      setSessionId(session.sessionId);

      const label = formatEventTitle(event);
      if (event.streamAvailability === "fixture" && event.provider !== "sportsurge") {
        router.push(
          `/watch/${session.sessionId}?title=${encodeURIComponent(label)}&from=${encodeURIComponent(`/sports/${event.id}`)}&kind=live`
        );
        return;
      }

      const src = `/watch/${encodeURIComponent(session.sessionId)}?embed=1&title=${encodeURIComponent(label)}&from=${encodeURIComponent(`/sports/${event.id}`)}`;
      setIframeSrc(src);
    } catch (err) {
      setPlayError(isApiClientError(err) ? err.message : "Could not start playback");
      setIframeSrc(null);
    } finally {
      setBusy(false);
    }
  }

  const playable =
    event?.streamAvailability === "fixture" || event?.streamAvailability === "available";

  const showPlayer = Boolean(iframeSrc);
  const showLoader = busy || (showPlayer && !iframeReady);
  const eventLabel = event ? formatEventTitle(event) : "";
  const relatedLive = related.filter((e) => e.status === "live");
  const relatedUpcoming = related.filter((e) => e.status !== "live");

  return (
    <SiteShell
      flush
      pulseFooter
      searchHref="/sports"
      searchPlaceholder="Search sports"
    >
      {error ? (
        <div className="pulse-content">
          <StateBlock tone="error" title="Event unavailable" message={error} />
        </div>
      ) : null}
      {!error && !event ? (
        <div className="pulse-content">
          <StateBlock title="Loading…" message="Fetching event details." />
        </div>
      ) : null}

      {event ? (
        <>
          <section className="pulse-hero pulse-hero--event" aria-label={eventLabel}>
            <div className="pulse-hero-bg" aria-hidden />
            <div className="pulse-hero-inner">
              <div className="pulse-hero-badges">
                {event.status === "live" ? (
                  <span className="pulse-badge pulse-badge--live">LIVE NOW</span>
                ) : (
                  <span className="pulse-badge">{event.status.toUpperCase()}</span>
                )}
                <span className="pulse-badge pulse-badge--ghost">
                  {event.competition.toUpperCase()}
                </span>
                <span className="pulse-badge pulse-badge--ghost">4K ULTRA HD</span>
                <span className="pulse-badge pulse-badge--ghost">DOLBY ATMOS 5.1</span>
                <span className="pulse-badge pulse-badge--ghost">MULTI-CAM READY</span>
              </div>

              <p className="pulse-hero-kicker">{eventSubtitle(event)}</p>
              <h1 className="pulse-hero-title">{eventLabel}</h1>
              <p className="pulse-hero-desc">
                {event.provider === "sportsurge"
                  ? "Official broadcast feed remuxed for ultra-low latency playback in your browser."
                  : "Event details from the configured sports provider."}
              </p>

              <div className="pulse-event-scorecard">
                <div className="pulse-event-teams">
                  <div>
                    <span className="pulse-team-abbr">{teamAbbr(event.homeTeam)}</span>
                    <span>{event.homeTeam ?? "Home"}</span>
                  </div>
                  <div className="pulse-event-vs">
                    {eventScoreLabel(event) ? (
                      <strong>
                        {event.score?.home} : {event.score?.away}
                      </strong>
                    ) : (
                      <strong>VS</strong>
                    )}
                    <span>
                      {event.status === "live" ? "LIVE" : formatStartTime(event.startTime)}
                    </span>
                  </div>
                  <div>
                    <span className="pulse-team-abbr">{teamAbbr(event.awayTeam)}</span>
                    <span>{event.awayTeam ?? "Away"}</span>
                  </div>
                </div>
                <p className="pulse-event-feed">
                  <span className="pulse-ok-dot" /> Official Broadcast Feed · {event.streamAvailability}
                </p>
              </div>

              <div className="pulse-hero-actions">
                {playable ? (
                  <button
                    type="button"
                    className="accent-btn pulse-cta"
                    disabled={busy}
                    onClick={() => void startWatch()}
                  >
                    {busy
                      ? "Starting…"
                      : showPlayer
                        ? "Restart Live Stream"
                        : "▶ Watch Live Stream"}
                  </button>
                ) : event.status === "upcoming" ? (
                  <button type="button" className="accent-btn pulse-cta" disabled>
                    <MatchCountdown
                      startTime={event.startTime}
                      status={event.status}
                      onElapsed={() => {
                        // Soft reload so streamAvailability can flip to available.
                        void apiClient.getSportEvent(eventId).then(setEvent).catch(() => undefined);
                      }}
                    />
                  </button>
                ) : (
                  <button type="button" className="accent-btn pulse-cta" disabled>
                    Stream unavailable
                  </button>
                )}
                <button type="button" className="ghost-btn pulse-cta-ghost">
                  + Add to My List
                </button>
                <button
                  type="button"
                  className="ghost-btn pulse-cta-ghost"
                  onClick={() => setTab("lineups")}
                >
                  Tactical Lineups &amp; Stats
                </button>
              </div>
            </div>
          </section>

          <div className="pulse-content">
            {playError ? (
              <StateBlock tone="error" title="Playback failed" message={playError} />
            ) : null}

            {showPlayer || showLoader ? (
              <section
                className={`sport-embed pulse-player${cinemaMode ? " is-cinema-mode" : ""}`}
                aria-label={`${eventLabel} live stream`}
              >
                <div className="sport-embed-frame">
                  {showLoader ? (
                    <div className="sport-embed-loader" role="status" aria-live="polite">
                      <span className="sport-embed-spinner" aria-hidden />
                      <p>{busy ? "Starting live stream…" : "Loading player…"}</p>
                    </div>
                  ) : null}
                  {iframeSrc ? (
                    <iframe
                      key={iframeSrc}
                      src={iframeSrc}
                      title={`${eventLabel} live stream`}
                      allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                      allowFullScreen
                      onLoad={() => setIframeReady(true)}
                    />
                  ) : null}
                </div>
              </section>
            ) : null}

            {!playable ? (
              <StateBlock
                tone="warn"
                title="No playable stream"
                message={
                  event.streamAvailability === "provider_required"
                    ? "An authorized live stream provider is required for this event."
                    : "Schedule only — no playable remux source for this listing."
                }
              />
            ) : null}

            <div className="pulse-filter-bar pulse-tabs" role="tablist">
              {(
                [
                  ["timeline", "Timeline & Events"],
                  ["stats", "Live Stats"],
                  ["lineups", "Tactical Lineups"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  className={`pulse-chip${tab === id ? " is-active" : ""}`}
                  onClick={() => setTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>

            <section className="pulse-panel">
              {tab === "timeline" ? (
                <>
                  <h2>Match timeline</h2>
                  <ul className="pulse-timeline">
                    <li>
                      <span className="pulse-badge pulse-badge--ghost">INFO</span>
                      <div>
                        <strong>{eventLabel}</strong>
                        <p className="muted">
                          {event.competition} · {event.sport} · Provider {event.provider}
                        </p>
                      </div>
                    </li>
                    <li>
                      <span className="pulse-badge pulse-badge--ghost">STATUS</span>
                      <div>
                        <strong>{event.status}</strong>
                        <p className="muted">Stream: {event.streamAvailability}</p>
                      </div>
                    </li>
                    <li>
                      <span className="pulse-badge pulse-badge--ghost">KICKOFF</span>
                      <div>
                        <strong>{formatStartTime(event.startTime)}</strong>
                        <p className="muted">Listed start time (UTC)</p>
                      </div>
                    </li>
                  </ul>
                </>
              ) : null}
              {tab === "stats" ? (
                <>
                  <h2>Live stats</h2>
                  <p className="muted">
                    Detailed possession and shot maps appear when the feed provides them.
                    Current score: {eventScoreLabel(event) ?? "n/a"}.
                  </p>
                </>
              ) : null}
              {tab === "lineups" ? (
                <>
                  <h2>Tactical lineups</h2>
                  <div className="pulse-lineups">
                    <div>
                      <h3>{event.homeTeam ?? "Home"}</h3>
                      <p className="muted">Starting XI not published for this feed.</p>
                    </div>
                    <div>
                      <h3>{event.awayTeam ?? "Away"}</h3>
                      <p className="muted">Starting XI not published for this feed.</p>
                    </div>
                  </div>
                </>
              ) : null}
            </section>

            {relatedLive.length > 0 ? (
              <section className="pulse-section">
                <div className="pulse-section-head">
                  <h2>
                    <span className="pulse-live-dot" /> Jump to Live Arenas
                  </h2>
                  <Link href="/sports?status=live" className="pulse-link">
                    See all
                  </Link>
                </div>
                <div className="pulse-live-grid">
                  {relatedLive.slice(0, 3).map((e) => (
                    <article key={e.id} className="pulse-live-card">
                      <div className="pulse-live-card-media">
                        <span className="pulse-badge pulse-badge--live">LIVE</span>
                      </div>
                      <div className="pulse-live-card-body">
                        <p className="pulse-live-card-league">{e.competition}</p>
                        <h3>{formatEventTitle(e)}</h3>
                        <Link
                          href={`/sports/${encodeURIComponent(e.id)}`}
                          className="accent-btn"
                        >
                          Jump In
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            {relatedUpcoming.length > 0 ? (
              <section className="pulse-section pulse-schedule">
                <div className="pulse-section-head">
                  <h2>Broadcast Schedule</h2>
                  <Link href="/sports" className="pulse-link">
                    Sports hub
                  </Link>
                </div>
                <ul className="pulse-schedule-list">
                  {relatedUpcoming.slice(0, 5).map((e) => (
                    <li key={e.id}>
                      <div>
                        <span className="pulse-schedule-when">
                          {formatStartTime(e.startTime)}
                        </span>
                        <strong>{formatEventTitle(e)}</strong>
                        <span className="muted">{e.competition}</span>
                      </div>
                      <Link
                        href={`/sports/${encodeURIComponent(e.id)}`}
                        className="ghost-btn"
                      >
                        Open
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        </>
      ) : null}
    </SiteShell>
  );
}
