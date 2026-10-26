"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SiteShell } from "./SiteShell";
import { EventCard } from "./EventCard";
import { CatalogGrid } from "./CatalogGrid";
import { SkeletonGrid, StateBlock } from "./StateBlock";
import { IconFilm, IconTrophy, IconTv } from "./Icons";
import { apiClient } from "@/lib/api-client";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";
import { isApiClientError } from "@/lib/api-error";
import {
  formatResumeLabel,
  listContinueWatch,
  type ContinueWatchEntry,
} from "@/lib/continue-watching";
import type { CatalogTitle, SportEvent } from "@frankenstein/shared-types";

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

  useEffect(() => {
    setContinueWatching(listContinueWatch(6));
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
          setMovies(movieRes.items.slice(0, 8));
          setSeries(seriesRes.items.slice(0, 8));
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

  return (
    <SiteShell>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">{BRAND_NAME}</p>
          <h1>Your next stream starts here.</h1>
          <p className="hero-lead">{BRAND_TAGLINE}</p>
          <div className="hero-actions">
            <Link href="/sports" className="accent-btn">
              Explore Sports
            </Link>
            <Link href="/movies" className="ghost-btn">
              Browse Movies
            </Link>
            <Link href="/series" className="ghost-btn">
              Explore Series
            </Link>
          </div>
        </div>
      </section>

      <section className="category-row" aria-label="Categories">
        <Link href="/sports" className="category-card">
          <IconTrophy size={28} />
          <h2>Sports</h2>
          <p>Live and upcoming events from the sports API. Watch when a stream is available.</p>
        </Link>
        <Link href="/movies" className="category-card">
          <IconFilm size={28} />
          <h2>Movies</h2>
          <p>Cinemeta catalog + Torrentio streams when STREMIO_ADDON_URL is set.</p>
        </Link>
        <Link href="/series" className="category-card">
          <IconTv size={28} />
          <h2>Series</h2>
          <p>Search shows, pick episodes, and stream via the same catalog stack.</p>
        </Link>
      </section>

      {continueWatching.length > 0 ? (
        <section className="content-section">
          <div className="section-head">
            <h2>Continue watching</h2>
            <span className="muted">This browser only</span>
          </div>
          <ul className="stream-list">
            {continueWatching.map((entry) => (
              <li key={entry.id}>
                <span>
                  {entry.title}
                  <span className="muted"> · {formatResumeLabel(entry.position)}</span>
                </span>
                <Link href={entry.href} className="accent-btn">
                  Resume
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="content-section">
        <div className="section-head">
          <h2>Live now</h2>
          <Link href="/sports?status=live">View all</Link>
        </div>
        {loadingSports ? <SkeletonGrid count={3} /> : null}
        {sportsError ? (
          <StateBlock tone="error" title="Sports unavailable" message={sportsError} />
        ) : null}
        {!loadingSports && !sportsError && live.length === 0 ? (
          <StateBlock
            title="No live events"
            message="The sports provider has no live events right now."
          />
        ) : null}
        {!loadingSports && live.length > 0 ? (
          <div className="card-grid">
            {live.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        ) : null}
      </section>

      {!loadingSports && !sportsError && upcoming.length > 0 ? (
        <section className="content-section">
          <div className="section-head">
            <h2>Upcoming matches</h2>
            <Link href="/sports?status=upcoming">View all</Link>
          </div>
          <div className="card-grid">
            {upcoming.slice(0, 4).map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="content-section">
        <div className="section-head">
          <h2>Popular movies</h2>
          <Link href="/movies">Browse</Link>
        </div>
        {loadingCatalog ? <SkeletonGrid count={4} /> : null}
        {catalogError ? (
          <StateBlock tone="error" title="Catalog unavailable" message={catalogError} />
        ) : null}
        {!loadingCatalog && movies.length > 0 ? (
          <CatalogGrid
            items={movies}
            actionLabel="Streams"
            hrefFor={(item) => `/movies/catalog/${encodeURIComponent(item.id)}`}
          />
        ) : null}
      </section>

      <section className="content-section">
        <div className="section-head">
          <h2>Popular series</h2>
          <Link href="/series">Browse</Link>
        </div>
        {loadingCatalog ? <SkeletonGrid count={4} /> : null}
        {!loadingCatalog && series.length > 0 ? (
          <CatalogGrid
            items={series}
            actionLabel="Episodes"
            hrefFor={(item) => `/series/${encodeURIComponent(item.id)}`}
          />
        ) : null}
      </section>
    </SiteShell>
  );
}
