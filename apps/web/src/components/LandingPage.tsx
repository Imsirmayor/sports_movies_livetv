"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CatalogTitle, SportEvent } from "@frankenstein/shared-types";
import { SiteShell } from "./SiteShell";
import { StateBlock } from "./StateBlock";
import { MatchCountdown } from "./MatchCountdown";
import { PulseCarousel } from "./PulseCarousel";
import { apiClient } from "@/lib/api-client";
import { isApiClientError } from "@/lib/api-error";
import { formatStartTime } from "@/lib/format";
import {
  formatResumeLabel,
  listContinueWatch,
  type ContinueWatchEntry,
} from "@/lib/continue-watching";
import { techBadgesFor, titleGenre, titleRating } from "@/lib/catalog-ui";
import {
  eventScoreLabel,
  eventSubtitle,
  formatEventTitle,
} from "@/lib/sports-ui";

type HomeFilter = "all" | "live" | "docs" | "series" | "originals" | "uhd";

type HeroSlide =
  | { kind: "sport"; event: SportEvent }
  | { kind: "movie"; item: CatalogTitle }
  | { kind: "series"; item: CatalogTitle };

export function LandingPage() {
  const [live, setLive] = useState<SportEvent[]>([]);
  const [upcoming, setUpcoming] = useState<SportEvent[]>([]);
  const [movies, setMovies] = useState<CatalogTitle[]>([]);
  const [series, setSeries] = useState<CatalogTitle[]>([]);
  const [continueWatching, setContinueWatching] = useState<ContinueWatchEntry[]>([]);
  const [sportsError, setSportsError] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [loadingSports, setLoadingSports] = useState(true);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [filter, setFilter] = useState<HomeFilter>("all");
  const [slide, setSlide] = useState(0);
  const [bannerPaused, setBannerPaused] = useState(false);

  useEffect(() => {
    setContinueWatching(listContinueWatch(12));
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingSports(true);
      setLoadingCatalog(true);
      try {
        const [liveRes, upcomingRes] = await Promise.all([
          apiClient.searchSportsEvents({ status: "live" }),
          apiClient.searchSportsEvents({ status: "upcoming" }),
        ]);
        if (!cancelled) {
          setLive(liveRes.events);
          setUpcoming(upcomingRes.events);
          setSportsError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setLive([]);
          setUpcoming([]);
          setSportsError(isApiClientError(err) ? err.message : "Sports unavailable");
        }
      } finally {
        if (!cancelled) setLoadingSports(false);
      }

      try {
        const [movieRes, seriesRes] = await Promise.all([
          apiClient.listCatalogMovies(),
          apiClient.listCatalogSeries(),
        ]);
        if (!cancelled) {
          setMovies(movieRes.items);
          setSeries(seriesRes.items);
          setCatalogError(
            movieRes.providerConfigured === false
              ? "STREMIO_ADDON_URL is not configured on the API"
              : null
          );
        }
      } catch (err) {
        if (!cancelled) {
          setMovies([]);
          setSeries([]);
          setCatalogError(isApiClientError(err) ? err.message : "Catalog unavailable");
        }
      } finally {
        if (!cancelled) setLoadingCatalog(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const slides = useMemo<HeroSlide[]>(() => {
    const out: HeroSlide[] = [];
    for (const event of live.slice(0, 4)) out.push({ kind: "sport", event });
    for (const item of movies.slice(0, 3)) out.push({ kind: "movie", item });
    for (const item of series.slice(0, 2)) out.push({ kind: "series", item });
    if (out.length === 0) {
      for (const event of upcoming.slice(0, 3)) out.push({ kind: "sport", event });
    }
    return out;
  }, [live, movies, series, upcoming]);

  useEffect(() => {
    setSlide(0);
  }, [slides.length]);

  useEffect(() => {
    if (slides.length <= 1 || bannerPaused) return;
    const id = window.setInterval(() => {
      setSlide((s) => (s + 1) % slides.length);
    }, 6_000);
    return () => window.clearInterval(id);
  }, [slides.length, bannerPaused]);

  const schedule = upcoming.slice(0, 6);
  const trendingMovies = movies.slice(0, 8);
  const originals = series.slice(0, 10);

  const showSports = filter === "all" || filter === "live";
  const showMovies = filter === "all" || filter === "docs" || filter === "uhd";
  const showSeries = filter === "all" || filter === "series" || filter === "originals";

  return (
    <SiteShell
      flush
      pulseFooter
      searchHref="/movies"
      searchPlaceholder="Search matches, movies, series"
    >
      {/* Hero banner slider — CSS fade + slide transitions */}
      <section
        className="pulse-banner"
        aria-roledescription="carousel"
        aria-label="Featured"
        onMouseEnter={() => setBannerPaused(true)}
        onMouseLeave={() => setBannerPaused(false)}
      >
        {slides.length === 0 ? (
          <div className="pulse-banner-slide is-active">
            <div className="pulse-banner-bg pulse-banner-bg--sport" aria-hidden />
            <div className="pulse-banner-inner">
              <div className="pulse-hero-badges">
                <span className="pulse-badge pulse-badge--live">PULSE HOME</span>
              </div>
              <h1 className="pulse-hero-title">Your next stream starts here</h1>
              <p className="pulse-hero-desc">
                Live sports, cinema, and series — ultra-low latency streaming from your configured
                API.
              </p>
              <div className="pulse-hero-actions">
                <Link href="/sports" className="accent-btn pulse-cta">
                  Explore Sports
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
        ) : (
          slides.map((item, i) => {
            const active = i === slide;
            if (item.kind === "sport") {
              return (
                <div
                  key={`sport-${item.event.id}`}
                  className={`pulse-banner-slide${active ? " is-active" : ""}`}
                  aria-hidden={!active}
                >
                  <div className="pulse-banner-bg pulse-banner-bg--sport" aria-hidden />
                  <div className="pulse-banner-inner">
                    <div className="pulse-banner-top">
                      <div className="pulse-hero-badges">
                        {item.event.status === "live" ? (
                          <span className="pulse-badge pulse-badge--live">LIVE NOW</span>
                        ) : (
                          <span className="pulse-badge">{item.event.status.toUpperCase()}</span>
                        )}
                        <span className="pulse-badge pulse-badge--ghost">
                          {item.event.competition.toUpperCase()}
                        </span>
                        <span className="pulse-badge pulse-badge--ghost">4K ULTRA HD</span>
                        <span className="pulse-badge pulse-badge--ghost">DOLBY ATMOS 5.1</span>
                      </div>
                      <div className="pulse-banner-stats">
                        <span>BITRATE 24.2 Mbps</span>
                        <span>LATENCY 0.3s</span>
                      </div>
                    </div>
                    <p className="pulse-hero-kicker">{eventSubtitle(item.event)}</p>
                    <h1 className="pulse-hero-title">{formatEventTitle(item.event)}</h1>
                    {eventScoreLabel(item.event) ? (
                      <div className="pulse-banner-score">{eventScoreLabel(item.event)}</div>
                    ) : (
                      <div className="pulse-banner-score pulse-banner-score--soft">
                        <MatchCountdown
                          startTime={item.event.startTime}
                          status={item.event.status}
                        />
                      </div>
                    )}
                    <p className="pulse-hero-desc">
                      Authorized broadcast remux for low-latency in-browser playback. Multi-cam
                      ready when the feed is available.
                    </p>
                    <div className="pulse-hero-actions">
                      <Link
                        href={`/sports/${encodeURIComponent(item.event.id)}`}
                        className="accent-btn pulse-cta"
                        tabIndex={active ? 0 : -1}
                      >
                        ▶ Watch Live Stream
                      </Link>
                      <Link
                        href="/list"
                        className="ghost-btn pulse-cta-ghost"
                        tabIndex={active ? 0 : -1}
                      >
                        + Add to My List
                      </Link>
                      <Link
                        href={`/sports/${encodeURIComponent(item.event.id)}`}
                        className="ghost-btn pulse-cta-ghost"
                        tabIndex={active ? 0 : -1}
                      >
                        Tactical Lineups &amp; Stats
                      </Link>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={`${item.kind}-${item.item.id}`}
                className={`pulse-banner-slide${active ? " is-active" : ""}`}
                aria-hidden={!active}
              >
                <div
                  className="pulse-banner-bg"
                  style={
                    item.item.poster
                      ? {
                          backgroundImage: `linear-gradient(90deg, #0c0c0e 12%, rgba(12,12,14,0.55) 48%, rgba(12,12,14,0.25)), url(${item.item.poster})`,
                        }
                      : undefined
                  }
                  aria-hidden
                />
                <div className="pulse-banner-inner">
                  <div className="pulse-banner-top">
                    <div className="pulse-hero-badges">
                      <span className="pulse-badge pulse-badge--live">
                        {item.kind === "movie" ? "FEATURE SPOTLIGHT" : "SERIES SPOTLIGHT"}
                      </span>
                      <span className="pulse-badge pulse-badge--ghost">
                        ★ {titleRating(item.item)} IMDb
                      </span>
                      <span className="pulse-badge pulse-badge--ghost">
                        {titleGenre(item.item).toUpperCase()}
                      </span>
                    </div>
                    <div className="pulse-banner-stats">
                      <span>4K PIPELINE</span>
                      <span>HDR10+</span>
                    </div>
                  </div>
                  <h1 className="pulse-hero-title">{item.item.name}</h1>
                  <p className="pulse-hero-desc">
                    Remux-ready catalog title. Open the detail page to pick a source and start cinema
                    playback.
                  </p>
                  <div className="pulse-hero-actions">
                    <Link
                      href={
                        item.kind === "movie"
                          ? `/movies/catalog/${encodeURIComponent(item.item.id)}`
                          : `/series/${encodeURIComponent(item.item.id)}`
                      }
                      className="accent-btn pulse-cta"
                      tabIndex={active ? 0 : -1}
                    >
                      ▶ Watch Now
                    </Link>
                    <Link
                      href={item.kind === "movie" ? "/movies" : "/series"}
                      className="ghost-btn pulse-cta-ghost"
                      tabIndex={active ? 0 : -1}
                    >
                      Browse {item.kind === "movie" ? "Movies" : "Series"}
                    </Link>
                    <Link
                      href="/list"
                      className="ghost-btn pulse-cta-ghost"
                      tabIndex={active ? 0 : -1}
                    >
                      + Add to My List
                    </Link>
                  </div>
                </div>
              </div>
            );
          })
        )}

        {slides.length > 1 ? (
          <>
            <button
              type="button"
              className="pulse-carousel-arrow pulse-carousel-arrow--side pulse-banner-arrow pulse-banner-arrow--left"
              aria-label="Previous slide"
              onClick={() => setSlide((s) => (s - 1 + slides.length) % slides.length)}
            >
              ‹
            </button>
            <button
              type="button"
              className="pulse-carousel-arrow pulse-carousel-arrow--side pulse-banner-arrow pulse-banner-arrow--right"
              aria-label="Next slide"
              onClick={() => setSlide((s) => (s + 1) % slides.length)}
            >
              ›
            </button>
            <div className="pulse-banner-dots" role="group" aria-label="Banner slides">
              {slides.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  className={`pulse-banner-dot${i === slide ? " is-active" : ""}`}
                  aria-label={`Go to slide ${i + 1}`}
                  aria-current={i === slide}
                  onClick={() => setSlide(i)}
                />
              ))}
            </div>
          </>
        ) : null}
      </section>

      <div className="pulse-content">
        <div className="pulse-filter-bar pulse-cinema-filters" role="toolbar" aria-label="Channels">
          {(
            [
              ["all", "All Channels"],
              ["live", "Live Sports"],
              ["docs", "Documentaries"],
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
        </div>

        {showSports ? (
          <PulseCarousel title="Live Sports on Air" href="/sports?status=live" linkLabel="See all">
            {loadingSports ? (
              <div className="pulse-carousel-empty">
                <StateBlock title="Loading sports…" message="Fetching live events." />
              </div>
            ) : null}
            {sportsError ? (
              <div className="pulse-carousel-empty">
                <StateBlock tone="error" title="Sports unavailable" message={sportsError} />
              </div>
            ) : null}
            {!loadingSports && !sportsError && live.length === 0 ? (
              <div className="pulse-carousel-empty">
                <StateBlock
                  title="No live events"
                  message="The sports provider has no live events right now."
                />
              </div>
            ) : null}
            {live.map((event) => (
              <Link
                key={event.id}
                href={`/sports/${encodeURIComponent(event.id)}`}
                className="pulse-live-card pulse-carousel-card"
              >
                <div className="pulse-live-card-media">
                  <span className="pulse-badge pulse-badge--live">LIVE</span>
                </div>
                <div className="pulse-live-card-body">
                  <p className="pulse-live-card-league">{event.competition}</p>
                  <h3>{formatEventTitle(event)}</h3>
                  <p className="pulse-live-card-score">
                    {eventScoreLabel(event) ?? (
                      <MatchCountdown startTime={event.startTime} status={event.status} />
                    )}
                  </p>
                  <span className="accent-btn">Jump In</span>
                </div>
              </Link>
            ))}
          </PulseCarousel>
        ) : null}

        {continueWatching.length > 0 ? (
          <PulseCarousel title="Continue Watching" href="/list" linkLabel="My List">
            {continueWatching.map((entry) => (
              <Link
                key={entry.id}
                href={entry.href}
                className="pulse-continue-card pulse-carousel-card pulse-carousel-card--continue"
              >
                <div className="pulse-continue-thumb">
                  <span className="pulse-continue-play">▶</span>
                  <div className="pulse-continue-progress">
                    <span
                      style={{
                        width: `${
                          entry.duration > 0
                            ? Math.min(100, Math.round((entry.position / entry.duration) * 100))
                            : 12
                        }%`,
                      }}
                    />
                  </div>
                </div>
                <strong>{entry.title}</strong>
                <span className="muted">Resume {formatResumeLabel(entry.position)}</span>
              </Link>
            ))}
          </PulseCarousel>
        ) : null}

        {showMovies ? (
          <PulseCarousel title="Top Trending Movies" href="/movies" linkLabel="Browse">
            {loadingCatalog ? (
              <div className="pulse-carousel-empty">
                <StateBlock title="Loading movies…" message="Fetching catalog." />
              </div>
            ) : null}
            {catalogError ? (
              <div className="pulse-carousel-empty">
                <StateBlock tone="error" title="Catalog unavailable" message={catalogError} />
              </div>
            ) : null}
            {trendingMovies.map((item, i) => (
              <Link
                key={item.id}
                href={`/movies/catalog/${encodeURIComponent(item.id)}`}
                className="pulse-poster-card pulse-carousel-card pulse-carousel-card--poster"
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
          </PulseCarousel>
        ) : null}

        {showSeries ? (
          <PulseCarousel
            title="Originals & Complete Box Sets"
            href="/series"
            linkLabel="Browse series"
          >
            {originals.map((item, i) => (
              <article key={item.id} className="pulse-award-card pulse-carousel-card pulse-carousel-card--wide">
                <Link
                  href={`/series/${encodeURIComponent(item.id)}`}
                  className="pulse-award-media"
                >
                  {item.poster ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.poster} alt="" />
                  ) : (
                    <div className="pulse-poster-fallback" />
                  )}
                  <span className="pulse-award-badge">
                    {i === 0 ? "EDITOR'S PICK" : i === 1 ? "BOX SET" : "TRENDING"}
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
            {!loadingCatalog && originals.length === 0 ? (
              <div className="pulse-carousel-empty">
                <StateBlock title="No series" message="Catalog returned no titles." />
              </div>
            ) : null}
          </PulseCarousel>
        ) : null}

        <div className="pulse-split pulse-home-split">
          <section className="pulse-section">
            <div className="pulse-section-head">
              <h2>Top Trending Now</h2>
              <Link href="/movies" className="pulse-link">
                Movies
              </Link>
            </div>
            <div className="pulse-poster-row">
              {movies.slice(0, 3).map((item, i) => (
                <Link
                  key={item.id}
                  href={`/movies/catalog/${encodeURIComponent(item.id)}`}
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
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <section className="pulse-section">
            <div className="pulse-section-head">
              <h2>Live Schedule</h2>
              <Link href="/sports?status=upcoming" className="pulse-link">
                Full schedule
              </Link>
            </div>
            {schedule.length === 0 ? (
              <StateBlock title="No upcoming" message="Check back soon for the next kickoffs." />
            ) : (
              <ul className="pulse-schedule-list">
                {schedule.map((event) => (
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
      </div>
    </SiteShell>
  );
}
