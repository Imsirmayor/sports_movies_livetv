"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CatalogTitle, SportEvent } from "@frankenstein/shared-types";
import { SiteShell } from "./SiteShell";
import { StateBlock } from "./StateBlock";
import { MatchCountdown } from "./MatchCountdown";
import { PulseCarousel } from "./PulseCarousel";
import { apiClient } from "@/lib/api-client";
import { formatStartTime } from "@/lib/format";
import {
  clearContinueWatch,
  formatResumeLabel,
  listContinueWatch,
  type ContinueWatchEntry,
} from "@/lib/continue-watching";
import { techBadgesFor, titleGenre, titleRating } from "@/lib/catalog-ui";
import { formatEventTitle } from "@/lib/sports-ui";

type ListFilter = "all" | "sports" | "catalog" | "series" | "originals" | "uhd";
type ViewMode = "grid" | "list";
type TrendingTab = "movies" | "series";

function entryKind(entry: ContinueWatchEntry): "movies" | "series" | "sports" | "other" {
  if (entry.id.startsWith("movie:") || entry.href.includes("/movies/")) return "movies";
  if (entry.id.startsWith("series:") || entry.href.includes("/series/")) return "series";
  if (entry.href.includes("/sports/")) return "sports";
  return "other";
}

function progressPct(entry: ContinueWatchEntry): number {
  if (entry.duration > 0) {
    return Math.min(100, Math.round((entry.position / entry.duration) * 100));
  }
  return 12;
}

function timeLeftLabel(entry: ContinueWatchEntry): string {
  if (entry.duration > 0 && entry.duration > entry.position) {
    const left = entry.duration - entry.position;
    return `${formatResumeLabel(left)} left of ${formatResumeLabel(entry.duration)}`;
  }
  return `Resume ${formatResumeLabel(entry.position)}`;
}

export function MyListPage() {
  const [entries, setEntries] = useState<ContinueWatchEntry[]>([]);
  const [movies, setMovies] = useState<CatalogTitle[]>([]);
  const [series, setSeries] = useState<CatalogTitle[]>([]);
  const [upcoming, setUpcoming] = useState<SportEvent[]>([]);
  const [filter, setFilter] = useState<ListFilter>("all");
  const [view, setView] = useState<ViewMode>("grid");
  const [trendingTab, setTrendingTab] = useState<TrendingTab>("movies");

  function refresh() {
    setEntries(listContinueWatch(24));
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [movieRes, seriesRes, sportsRes] = await Promise.all([
          apiClient.listCatalogMovies().catch(() => null),
          apiClient.listCatalogSeries().catch(() => null),
          apiClient.searchSportsEvents({ status: "upcoming" }).catch(() => null),
        ]);
        if (cancelled) return;
        setMovies(movieRes?.items ?? []);
        setSeries(seriesRes?.items ?? []);
        setUpcoming(sportsRes?.events?.slice(0, 6) ?? []);
      } catch {
        if (!cancelled) {
          setMovies([]);
          setSeries([]);
          setUpcoming([]);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const movieEntries = useMemo(
    () => entries.filter((e) => entryKind(e) === "movies"),
    [entries]
  );
  const seriesEntries = useMemo(
    () => entries.filter((e) => entryKind(e) === "series"),
    [entries]
  );
  const sportEntries = useMemo(
    () => entries.filter((e) => entryKind(e) === "sports"),
    [entries]
  );

  const filtered = useMemo(() => {
    if (filter === "all") return entries;
    if (filter === "sports") return sportEntries;
    if (filter === "series" || filter === "originals") return seriesEntries;
    if (filter === "catalog" || filter === "uhd") {
      return entries.filter((e) => {
        const k = entryKind(e);
        return k === "movies" || k === "series";
      });
    }
    return entries;
  }, [entries, filter, sportEntries, seriesEntries]);

  const hero = filtered[0] ?? entries[0] ?? null;
  const heroMovie = movies[0] ?? null;
  const trending = trendingTab === "movies" ? movies.slice(0, 3) : series.slice(0, 3);
  const suggestions = movies.slice(0, 10);
  const boxSets = series.slice(0, 8);

  return (
    <SiteShell
      flush
      pulseFooter
      searchHref="/movies"
      searchPlaceholder="Search titles, artists…"
    >
      {/* Hero */}
      {hero ? (
        <section className="pulse-banner" aria-label="My List spotlight">
          <div className="pulse-banner-slide is-active">
            <div className="pulse-banner-bg pulse-banner-bg--sport" aria-hidden />
            <div className="pulse-banner-inner">
              <div className="pulse-banner-top">
                <div className="pulse-hero-badges">
                  <span className="pulse-badge pulse-badge--live">MY LIST</span>
                  <span className="pulse-badge pulse-badge--ghost">
                    {entryKind(hero).toUpperCase()}
                  </span>
                  <span className="pulse-badge pulse-badge--ghost">
                    {progressPct(hero)}% WATCHED
                  </span>
                  <span className="pulse-badge pulse-badge--ghost">4K ULTRA HD</span>
                  <span className="pulse-badge pulse-badge--ghost">DOLBY ATMOS</span>
                </div>
                <div className="pulse-banner-stats">
                  <span>LOCAL PROFILE</span>
                  <span>THIS BROWSER</span>
                </div>
              </div>
              <h1 className="pulse-hero-title">{hero.title}</h1>
              <p className="pulse-hero-desc">
                Pick up where you left off. Progress is saved on this device only — no account
                required.
              </p>
              <div className="pulse-continue-progress pulse-banner-progress" aria-hidden>
                <span style={{ width: `${progressPct(hero)}%` }} />
              </div>
              <p className="muted" style={{ marginTop: "0.55rem" }}>
                {timeLeftLabel(hero)}
              </p>
              <div className="pulse-hero-actions">
                <Link href={hero.href} className="accent-btn pulse-cta">
                  ▶ Continue Watching
                </Link>
                <button
                  type="button"
                  className="ghost-btn pulse-cta-ghost"
                  onClick={() => {
                    clearContinueWatch(hero.id);
                    refresh();
                  }}
                >
                  Remove from My List
                </button>
                <Link href="/" className="ghost-btn pulse-cta-ghost">
                  Back to Home
                </Link>
              </div>
            </div>
          </div>
        </section>
      ) : heroMovie ? (
        <section className="pulse-banner" aria-label="My List empty spotlight">
          <div className="pulse-banner-slide is-active">
            <div
              className="pulse-banner-bg"
              style={
                heroMovie.poster
                  ? {
                      backgroundImage: `linear-gradient(90deg, #0c0c0e 12%, rgba(12,12,14,0.55) 48%, rgba(12,12,14,0.25)), url(${heroMovie.poster})`,
                    }
                  : undefined
              }
              aria-hidden
            />
            <div className="pulse-banner-inner">
              <div className="pulse-hero-badges">
                <span className="pulse-badge pulse-badge--live">MY LIST</span>
                <span className="pulse-badge pulse-badge--ghost">EMPTY · START WATCHING</span>
                <span className="pulse-badge pulse-badge--ghost">4K ULTRA HD</span>
              </div>
              <h1 className="pulse-hero-title">{heroMovie.name}</h1>
              <p className="pulse-hero-desc">
                Your list is empty. Start a title and it will appear here automatically when you
                pause past the first few seconds.
              </p>
              <div className="pulse-hero-actions">
                <Link
                  href={`/movies/catalog/${encodeURIComponent(heroMovie.id)}`}
                  className="accent-btn pulse-cta"
                >
                  ▶ Watch Now
                </Link>
                <Link href="/movies" className="ghost-btn pulse-cta-ghost">
                  Browse Movies
                </Link>
                <Link href="/series" className="ghost-btn pulse-cta-ghost">
                  Explore Series
                </Link>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="pulse-banner" aria-label="My List">
          <div className="pulse-banner-slide is-active">
            <div className="pulse-banner-bg pulse-banner-bg--sport" aria-hidden />
            <div className="pulse-banner-inner">
              <div className="pulse-hero-badges">
                <span className="pulse-badge pulse-badge--live">MY LIST</span>
              </div>
              <h1 className="pulse-hero-title">Nothing in progress yet</h1>
              <p className="pulse-hero-desc">
                Start a movie or episode and it will land here for quick resume.
              </p>
              <div className="pulse-hero-actions">
                <Link href="/movies" className="accent-btn pulse-cta">
                  Browse Movies
                </Link>
                <Link href="/series" className="ghost-btn pulse-cta-ghost">
                  Explore Series
                </Link>
                <Link href="/sports" className="ghost-btn pulse-cta-ghost">
                  Live Sports
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="pulse-content">
        <div className="pulse-filter-bar pulse-cinema-filters pulse-mylist-filters" role="toolbar">
          {(
            [
              ["all", "All Content"],
              ["sports", "Live Sports"],
              ["catalog", "Series / Movies"],
              ["series", "Trending Series"],
              ["originals", "Originals & Docs"],
              ["uhd", "4K Remasters"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`pulse-chip${filter === id ? " is-active" : ""}`}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
          <div className="pulse-view-toggle" role="group" aria-label="Layout">
            <button
              type="button"
              className={`pulse-view-btn${view === "grid" ? " is-active" : ""}`}
              aria-pressed={view === "grid"}
              onClick={() => setView("grid")}
              title="Grid"
            >
              ▦
            </button>
            <button
              type="button"
              className={`pulse-view-btn${view === "list" ? " is-active" : ""}`}
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
              title="List"
            >
              ☰
            </button>
          </div>
        </div>

        {/* Continue watching / in progress */}
        {filtered.length > 0 ? (
          view === "grid" ? (
            <PulseCarousel title="Continue Watching" linkLabel={`${filtered.length} titles`}>
              {filtered.map((entry) => (
                <article
                  key={entry.id}
                  className="pulse-mylist-slide pulse-carousel-card"
                >
                  <Link href={entry.href} className="pulse-mylist-slide-thumb">
                    <span className="pulse-badge pulse-badge--live">
                      {entryKind(entry).toUpperCase()}
                    </span>
                    <span className="pulse-continue-play">▶</span>
                    <div className="pulse-continue-progress">
                      <span style={{ width: `${progressPct(entry)}%` }} />
                    </div>
                  </Link>
                  <div className="pulse-mylist-slide-body">
                    <h3>
                      <Link href={entry.href}>{entry.title}</Link>
                    </h3>
                    <p className="muted">{timeLeftLabel(entry)}</p>
                    <div className="pulse-mylist-actions">
                      <Link href={entry.href} className="accent-btn">
                        Continue
                      </Link>
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={() => {
                          clearContinueWatch(entry.id);
                          refresh();
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </PulseCarousel>
          ) : (
            <section className="pulse-section">
              <div className="pulse-section-head">
                <h2>Continue Watching</h2>
                <span className="muted">{filtered.length} titles</span>
              </div>
              <ul className="pulse-mylist-rows">
                {filtered.map((entry) => (
                  <li key={entry.id}>
                    <div>
                      <strong>{entry.title}</strong>
                      <span className="muted">
                        {entryKind(entry)} · {timeLeftLabel(entry)}
                      </span>
                    </div>
                    <div className="pulse-mylist-actions">
                      <Link href={entry.href} className="accent-btn">
                        Continue
                      </Link>
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={() => {
                          clearContinueWatch(entry.id);
                          refresh();
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )
        ) : (
          <StateBlock
            title="My List is empty"
            message="Watch something from Movies or Series to populate this page."
          />
        )}

        {movieEntries.length > 0 && (filter === "all" || filter === "catalog" || filter === "uhd") ? (
          <PulseCarousel title="Saved Movies" linkLabel={`${movieEntries.length}`}>
            {movieEntries.map((entry) => (
              <Link
                key={entry.id}
                href={entry.href}
                className="pulse-continue-card pulse-carousel-card pulse-carousel-card--continue"
              >
                <div className="pulse-continue-thumb">
                  <span className="pulse-continue-play">▶</span>
                  <div className="pulse-continue-progress">
                    <span style={{ width: `${progressPct(entry)}%` }} />
                  </div>
                </div>
                <strong>{entry.title}</strong>
                <span className="muted">{timeLeftLabel(entry)}</span>
              </Link>
            ))}
          </PulseCarousel>
        ) : null}

        {seriesEntries.length > 0 &&
        (filter === "all" || filter === "catalog" || filter === "series" || filter === "originals") ? (
          <PulseCarousel title="Watch Later Series" linkLabel={`${seriesEntries.length}`}>
            {seriesEntries.map((entry) => (
              <Link
                key={entry.id}
                href={entry.href}
                className="pulse-continue-card pulse-carousel-card pulse-carousel-card--continue"
              >
                <div className="pulse-continue-thumb">
                  <span className="pulse-continue-play">▶</span>
                  <div className="pulse-continue-progress">
                    <span style={{ width: `${progressPct(entry)}%` }} />
                  </div>
                </div>
                <strong>{entry.title}</strong>
                <span className="muted">{timeLeftLabel(entry)}</span>
              </Link>
            ))}
          </PulseCarousel>
        ) : null}

        <div className="pulse-split pulse-home-split">
          <section className="pulse-section">
            <div className="pulse-section-head">
              <h2>Top Trending Now</h2>
              <div className="pulse-view-toggle">
                <button
                  type="button"
                  className={`pulse-view-btn${trendingTab === "movies" ? " is-active" : ""}`}
                  onClick={() => setTrendingTab("movies")}
                >
                  Movies
                </button>
                <button
                  type="button"
                  className={`pulse-view-btn${trendingTab === "series" ? " is-active" : ""}`}
                  onClick={() => setTrendingTab("series")}
                >
                  Series
                </button>
              </div>
            </div>
            <div className="pulse-poster-row">
              {trending.map((item, i) => (
                <Link
                  key={item.id}
                  href={
                    trendingTab === "movies"
                      ? `/movies/catalog/${encodeURIComponent(item.id)}`
                      : `/series/${encodeURIComponent(item.id)}`
                  }
                  className="pulse-poster-card"
                >
                  <span className="pulse-poster-rank">{i + 1}</span>
                  {item.poster ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.poster} alt="" />
                  ) : (
                    <div className="pulse-poster-fallback" />
                  )}
                  <div className="pulse-poster-meta">
                    <strong>{item.name}</strong>
                    <span>
                      ★ {titleRating(item)}
                      {item.year ? ` · ${item.year}` : ""}
                    </span>
                    <span className="muted">{techBadgesFor(item)[0]}</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <section className="pulse-section">
            <div className="pulse-section-head">
              <h2>Live Schedule</h2>
              <Link href="/sports?status=upcoming" className="pulse-link">
                Full guide
              </Link>
            </div>
            {upcoming.length === 0 ? (
              <StateBlock title="No upcoming" message="Check Sports for the next kickoffs." />
            ) : (
              <ul className="pulse-schedule-list">
                {upcoming.map((event) => (
                  <li key={event.id}>
                    <div>
                      <strong>{formatEventTitle(event)}</strong>
                      <span className="pulse-schedule-when">
                        {formatStartTime(event.startTime)} · {event.competition}
                      </span>
                    </div>
                    <MatchCountdown startTime={event.startTime} status={event.status} />
                    <Link href={`/sports/${encodeURIComponent(event.id)}`} className="ghost-btn">
                      Open
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <PulseCarousel title="Suggested for Your List" href="/movies" linkLabel="Browse">
          {suggestions.map((item) => (
            <Link
              key={item.id}
              href={`/movies/catalog/${encodeURIComponent(item.id)}`}
              className="pulse-poster-card pulse-carousel-card pulse-carousel-card--poster"
            >
              {item.poster ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.poster} alt="" />
              ) : (
                <div className="pulse-poster-fallback" />
              )}
              <div className="pulse-poster-meta">
                <strong>{item.name}</strong>
                <span>
                  ★ {titleRating(item)}
                  {item.year ? ` · ${item.year}` : ""}
                </span>
              </div>
            </Link>
          ))}
        </PulseCarousel>

        <PulseCarousel title="Originals & Complete Box Sets" href="/series" linkLabel="Browse series">
          {boxSets.map((item, i) => (
            <article
              key={item.id}
              className="pulse-award-card pulse-carousel-card pulse-carousel-card--wide"
            >
              <Link href={`/series/${encodeURIComponent(item.id)}`} className="pulse-award-media">
                {item.poster ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.poster} alt="" />
                ) : (
                  <div className="pulse-poster-fallback" />
                )}
                <span className="pulse-award-badge">
                  {i === 0 ? "EDITOR'S PICK" : "BOX SET"}
                </span>
              </Link>
              <div className="pulse-award-body">
                <h3>
                  <Link href={`/series/${encodeURIComponent(item.id)}`}>{item.name}</Link>
                </h3>
                <p className="muted">
                  {item.year ?? "—"} · ★ {titleRating(item)} · {titleGenre(item)}
                </p>
                <div className="pulse-award-foot">
                  <span>{techBadgesFor(item)[0]}</span>
                  <Link
                    href={`/series/${encodeURIComponent(item.id)}`}
                    className="accent-btn"
                    style={{ padding: "0.35rem 0.75rem", fontSize: "0.75rem" }}
                  >
                    Start Season 1
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </PulseCarousel>
      </div>
    </SiteShell>
  );
}
