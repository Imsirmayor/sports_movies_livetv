"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { CatalogTitle, SportEvent, SportEventStatus } from "@frankenstein/shared-types";
import { SiteShell } from "./SiteShell";
import { StateBlock } from "./StateBlock";
import { apiClient } from "@/lib/api-client";
import { isApiClientError } from "@/lib/api-error";
import { listContinueWatch, formatResumeLabel } from "@/lib/continue-watching";
import { MatchCountdown } from "./MatchCountdown";
import {
  eventScoreLabel,
  eventSubtitle,
  formatEventTitle,
  teamAbbr,
} from "@/lib/sports-ui";

type FeedFilter = "all" | "live" | "upcoming" | "sport";

export function SportsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [events, setEvents] = useState<SportEvent[]>([]);
  const [movies, setMovies] = useState<CatalogTitle[]>([]);
  const [continueWatching, setContinueWatching] = useState(() =>
    typeof window !== "undefined" ? listContinueWatch(4) : []
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feed, setFeed] = useState<FeedFilter>("all");
  const [sportChip, setSportChip] = useState("");

  const statusParam = (params.get("status") as SportEventStatus | null) ?? "";

  useEffect(() => {
    setContinueWatching(listContinueWatch(4));
  }, []);

  useEffect(() => {
    let cancelled = false;
    let first = true;
    async function load(soft = false) {
      if (!soft) setLoading(true);
      try {
        const status =
          statusParam === "live" ||
          statusParam === "upcoming" ||
          statusParam === "finished"
            ? statusParam
            : undefined;
        const [sportsRes, catalogRes] = await Promise.all([
          apiClient.searchSportsEvents({
            q: params.get("q") || undefined,
            team: params.get("team") || undefined,
            sport: params.get("sport") || undefined,
            competition: params.get("competition") || undefined,
            status,
          }),
          first
            ? apiClient.listCatalogMovies().catch(() => null)
            : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setEvents(sportsRes.events);
        if (catalogRes) setMovies(catalogRes.items?.slice(0, 6) ?? []);
        setError(null);
      } catch (err) {
        if (!cancelled && !soft) {
          setEvents([]);
          setError(isApiClientError(err) ? err.message : "Failed to load sports");
        }
      } finally {
        first = false;
        if (!cancelled) setLoading(false);
      }
    }
    void load(false);
    // Keep listings fresh — API cache is ~8s; poll a bit above that.
    const id = window.setInterval(() => void load(true), 12_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [params, statusParam]);

  const sports = useMemo(
    () => [...new Set(events.map((e) => e.sport).filter(Boolean))].sort(),
    [events]
  );

  const live = useMemo(
    () => events.filter((e) => e.status === "live"),
    [events]
  );
  const upcoming = useMemo(
    () => events.filter((e) => e.status === "upcoming"),
    [events]
  );

  const filteredLive = useMemo(() => {
    let list = live;
    if (sportChip) list = list.filter((e) => e.sport === sportChip);
    return list;
  }, [live, sportChip]);

  const hero = live[0] ?? upcoming[0] ?? events[0] ?? null;

  const schedule =
    upcoming.length > 0
      ? upcoming
      : events.filter((e) => e.status !== "live" && e.id !== hero?.id).slice(0, 8);

  function setStatusFilter(status: string) {
    const next = new URLSearchParams(params.toString());
    if (!status) next.delete("status");
    else next.set("status", status);
    const qs = next.toString();
    router.replace(qs ? `/sports?${qs}` : "/sports");
  }

  return (
    <SiteShell
      flush
      pulseFooter
      searchHref="/sports"
      searchPlaceholder="Search matches, shows, stadiums"
    >
      {/* Hero — featured match */}
      {hero ? (
        <section className="pulse-hero" aria-label="Featured match">
          <div className="pulse-hero-bg" aria-hidden />
          <div className="pulse-hero-inner">
            <div className="pulse-hero-badges">
              {hero.status === "live" ? (
                <span className="pulse-badge pulse-badge--live">LIVE NOW</span>
              ) : (
                <span className="pulse-badge">{hero.status.toUpperCase()}</span>
              )}
              <span className="pulse-badge pulse-badge--ghost">
                {hero.competition.toUpperCase()}
              </span>
              <span className="pulse-badge pulse-badge--ghost">HD STREAM</span>
              <span className="pulse-badge pulse-badge--ghost">MULTI-CAM READY</span>
            </div>
            <p className="pulse-hero-kicker">{eventSubtitle(hero)}</p>
            <h1 className="pulse-hero-title">{formatEventTitle(hero)}</h1>
            <p className="pulse-hero-desc">
              {hero.status === "live"
                ? "Authorized broadcast feed remuxed for in-app playback. Jump in for the live stream."
                : "Set a reminder from the schedule below, or open the event page for stream status."}
            </p>
            {eventScoreLabel(hero) ? (
              <div className="pulse-scoreboard">
                <strong>{eventScoreLabel(hero)}</strong>
                <span className="pulse-scoreboard-meta">
                  <span className="pulse-live-dot" />
                  <MatchCountdown startTime={hero.startTime} status={hero.status} />
                </span>
              </div>
            ) : (
              <div className="pulse-scoreboard">
                <strong>
                  {teamAbbr(hero.homeTeam)} vs {teamAbbr(hero.awayTeam)}
                </strong>
                <span className="pulse-scoreboard-meta">
                  <MatchCountdown startTime={hero.startTime} status={hero.status} />
                </span>
              </div>
            )}
            <div className="pulse-hero-actions">
              {hero.status === "live" &&
              (hero.streamAvailability === "available" ||
                hero.streamAvailability === "fixture") ? (
                <Link
                  href={`/sports/${encodeURIComponent(hero.id)}`}
                  className="accent-btn pulse-cta"
                >
                  ▶ Watch Live Stream
                </Link>
              ) : (
                <button type="button" className="accent-btn pulse-cta" disabled>
                  <MatchCountdown startTime={hero.startTime} status={hero.status} />
                </button>
              )}
              <button type="button" className="ghost-btn pulse-cta-ghost">
                + Add to My List
              </button>
              <Link
                href={`/sports/${encodeURIComponent(hero.id)}`}
                className="ghost-btn pulse-cta-ghost"
              >
                Tactical Lineups &amp; Stats
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      <div className="pulse-content">
        {/* Filter chips */}
        <div className="pulse-filter-bar" role="navigation" aria-label="Sports filters">
          <button
            type="button"
            className={`pulse-chip${feed === "all" && !statusParam ? " is-active" : ""}`}
            onClick={() => {
              setFeed("all");
              setStatusFilter("");
            }}
          >
            All Streams
          </button>
          <button
            type="button"
            className={`pulse-chip${statusParam === "live" || feed === "live" ? " is-active" : ""}`}
            onClick={() => {
              setFeed("live");
              setStatusFilter("live");
            }}
          >
            Live Sports
            {live.length > 0 ? ` (${live.length} on air)` : ""}
          </button>
          <button
            type="button"
            className={`pulse-chip${statusParam === "upcoming" ? " is-active" : ""}`}
            onClick={() => {
              setFeed("upcoming");
              setStatusFilter("upcoming");
            }}
          >
            Featured Matches
          </button>
          <Link href="/series" className="pulse-chip">
            Trending Series
          </Link>
          <Link href="/movies" className="pulse-chip">
            Pulse Originals &amp; Docs
          </Link>
          {sports.slice(0, 4).map((s) => (
            <button
              key={s}
              type="button"
              className={`pulse-chip${sportChip === s ? " is-active" : ""}`}
              onClick={() => setSportChip(sportChip === s ? "" : s)}
            >
              {s}
            </button>
          ))}
        </div>

        {loading ? (
          <StateBlock title="Loading sports…" message="Fetching live and upcoming feeds." />
        ) : null}
        {error ? (
          <StateBlock tone="error" title="Could not load events" message={error} />
        ) : null}
        {!loading && !error && events.length === 0 ? (
          <StateBlock
            title="No events"
            message="Check back during game time or clear status filters."
          />
        ) : null}

        {/* Live Sports On Air */}
        {filteredLive.length > 0 ? (
          <section className="pulse-section">
            <div className="pulse-section-head">
              <h2>
                <span className="pulse-live-dot" /> Live Sports On Air
              </h2>
              <span className="muted">{filteredLive.length} active feeds</span>
            </div>
            <div className="pulse-live-grid">
              {filteredLive.slice(0, 6).map((event) => (
                <article key={event.id} className="pulse-live-card">
                  <div className="pulse-live-card-media">
                    <span className="pulse-badge pulse-badge--live">LIVE</span>
                    <span className="pulse-badge pulse-badge--ghost">HD</span>
                  </div>
                  <div className="pulse-live-card-body">
                    <p className="pulse-live-card-league">
                      {event.competition.toUpperCase()}
                    </p>
                    <h3>{formatEventTitle(event)}</h3>
                    <p className="pulse-live-card-score">
                      {eventScoreLabel(event) ??
                        `${teamAbbr(event.homeTeam)} vs ${teamAbbr(event.awayTeam)}`}
                    </p>
                    {event.status === "live" ? (
                      <Link
                        href={`/sports/${encodeURIComponent(event.id)}`}
                        className="accent-btn"
                      >
                        Jump In
                      </Link>
                    ) : (
                      <p className="pulse-live-card-countdown">
                        <MatchCountdown
                          startTime={event.startTime}
                          status={event.status}
                        />
                      </p>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {/* Continue Watching */}
        {continueWatching.length > 0 ? (
          <section className="pulse-section">
            <div className="pulse-section-head">
              <h2>Continue Watching</h2>
              <span className="muted">{continueWatching.length} in progress</span>
            </div>
            <div className="pulse-continue-row">
              {continueWatching.map((entry) => {
                const pct =
                  entry.duration > 0
                    ? Math.min(100, Math.round((entry.position / entry.duration) * 100))
                    : 12;
                const left =
                  entry.duration > 0
                    ? Math.max(0, Math.round((entry.duration - entry.position) / 60))
                    : null;
                return (
                  <Link key={entry.id} href={entry.href} className="pulse-continue-card">
                    <div className="pulse-continue-thumb">
                      <span className="pulse-continue-play">▶</span>
                      <div className="pulse-continue-progress">
                        <span style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <strong>{entry.title}</strong>
                    <span className="muted">
                      {left != null
                        ? `${left}m remaining`
                        : `At ${formatResumeLabel(entry.position)}`}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null}

        {/* Trending + Schedule */}
        <div className="pulse-split">
          <section className="pulse-section">
            <div className="pulse-section-head">
              <h2>Top Trending Now</h2>
              <Link href="/movies" className="pulse-link">
                Explore
              </Link>
            </div>
            {movies.length === 0 ? (
              <p className="muted">Catalog titles appear here when the addon is configured.</p>
            ) : (
              <div className="pulse-poster-row">
                {movies.slice(0, 3).map((m, i) => (
                  <Link
                    key={m.id}
                    href={`/movies/catalog/${encodeURIComponent(m.id)}`}
                    className="pulse-poster-card"
                  >
                    {m.poster ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.poster} alt="" />
                    ) : (
                      <div className="pulse-poster-fallback">{m.name.slice(0, 1)}</div>
                    )}
                    {i === 0 ? <span className="pulse-poster-rank">TOP 1</span> : null}
                    <div className="pulse-poster-meta">
                      <strong>{m.name}</strong>
                      <span className="muted">{m.year ?? "Movie"}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
            <div className="pulse-promo">
              <div>
                <h3>Spatial Theater Hub</h3>
                <p className="muted">Configure multi-cam and spatial audio for live arenas.</p>
              </div>
              <button type="button" className="ghost-btn">
                Configure
              </button>
            </div>
          </section>

          <section className="pulse-section pulse-schedule">
            <div className="pulse-section-head">
              <h2>Broadcast Schedule</h2>
              <span className="muted">UTC timing</span>
            </div>
            <ul className="pulse-schedule-list">
              {schedule.slice(0, 8).map((event) => (
                <li key={event.id}>
                  <div>
                    <span className="pulse-schedule-when">
                      <MatchCountdown
                        startTime={event.startTime}
                        status={event.status}
                      />
                    </span>
                    <strong>{formatEventTitle(event)}</strong>
                    <span className="muted">{event.competition}</span>
                  </div>
                  {event.status === "live" ? (
                    <Link
                      href={`/sports/${encodeURIComponent(event.id)}`}
                      className="ghost-btn"
                    >
                      Watch
                    </Link>
                  ) : (
                    <span className="ghost-btn" aria-disabled>
                      Waiting
                    </span>
                  )}
                </li>
              ))}
              {schedule.length === 0 ? (
                <li className="muted">No upcoming matchups in this feed.</li>
              ) : null}
            </ul>
          </section>
        </div>

        {/* Full league-style grid for remaining */}
        {events.length > 0 ? (
          <section className="pulse-section">
            <div className="pulse-section-head">
              <h2>All Matchups</h2>
              <span className="muted">{events.length} events</span>
            </div>
            <div className="pulse-match-grid">
              {events.slice(0, 24).map((event) => (
                <Link
                  key={event.id}
                  href={`/sports/${encodeURIComponent(event.id)}`}
                  className="pulse-match-row"
                >
                  <span
                    className={`pulse-badge${event.status === "live" ? " pulse-badge--live" : " pulse-badge--ghost"}`}
                  >
                    {event.status.toUpperCase()}
                  </span>
                  <div>
                    <strong>{formatEventTitle(event)}</strong>
                    <span className="muted">
                      {event.competition} · {event.sport}
                    </span>
                  </div>
                  <span className="pulse-match-cta">Open →</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </SiteShell>
  );
}
