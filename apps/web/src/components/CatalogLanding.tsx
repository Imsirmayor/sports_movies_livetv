"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { CatalogTitle } from "@frankenstein/shared-types";
import { SiteShell } from "./SiteShell";
import { StateBlock } from "./StateBlock";
import {
  CATALOG_GENRES,
  YEAR_FILTERS,
  filterCatalog,
  techBadgesFor,
  titleGenre,
  titleMatchPct,
  titleRating,
  type CatalogGenre,
  type YearFilterId,
} from "@/lib/catalog-ui";

type Kind = "movie" | "series";

type Props = {
  kind: Kind;
  items: CatalogTitle[];
  loading: boolean;
  error: string | null;
  configured: boolean | null;
  hrefFor: (item: CatalogTitle) => string;
};

const PAGE_SIZE = 25;

export function CatalogLanding({
  kind,
  items,
  loading,
  error,
  configured,
  hrefFor,
}: Props) {
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const [genre, setGenre] = useState<CatalogGenre>("All Genres");
  const [year, setYear] = useState<YearFilterId>("all");
  const [page, setPage] = useState(0);
  const [uhdOnly, setUhdOnly] = useState(false);

  useEffect(() => {
    setPage(0);
  }, [genre, year, q, kind]);

  const filtered = useMemo(
    () => filterCatalog(items, { genre, year, q }),
    [items, genre, year, q]
  );

  // Cosmetic tech filter — keeps ~half when enabled (stable on id).
  const visible = useMemo(() => {
    if (!uhdOnly) return filtered;
    return filtered.filter((_, i) => i % 2 === 0);
  }, [filtered, uhdOnly]);

  const hero = visible[0] ?? items[0] ?? null;
  const featured = visible.slice(0, 4);
  const catalogue = visible.slice(4);
  const pageItems = catalogue.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(catalogue.length / PAGE_SIZE));

  const noun = kind === "movie" ? "Films" : "Series";
  const searchHref = kind === "movie" ? "/movies" : "/series";
  const searchPlaceholder =
    kind === "movie" ? "Search movies, directors, years" : "Search TV series";

  return (
    <SiteShell flush pulseFooter searchHref={searchHref} searchPlaceholder={searchPlaceholder}>
      {hero ? (
        <section className="pulse-hero pulse-cinema-hero" aria-label={`Featured ${kind}`}>
          <div
            className="pulse-hero-bg pulse-cinema-hero-bg"
            style={
              hero.poster
                ? { backgroundImage: `linear-gradient(90deg, #0c0c0e 8%, rgba(12,12,14,0.55) 48%, rgba(12,12,14,0.2)), url(${hero.poster})` }
                : undefined
            }
            aria-hidden
          />
          <div className="pulse-hero-inner">
            <div className="pulse-hero-badges">
              <span className="pulse-badge pulse-badge--live">
                {kind === "movie" ? "WORLD PREMIERE SPOTLIGHT" : "SERIES SPOTLIGHT"}
              </span>
              <span className="pulse-badge pulse-badge--ghost">★ {titleRating(hero)} IMDb</span>
              <span className="pulse-badge pulse-badge--ghost">{titleMatchPct(hero)}% Match</span>
              <span className="pulse-badge pulse-badge--ghost">{titleGenre(hero).toUpperCase()}</span>
            </div>
            <h1 className="pulse-hero-title pulse-cinema-title">{hero.name}</h1>
            <p className="pulse-hero-desc">
              {kind === "movie"
                ? "Feature presentation remuxed for low-latency desktop cinema playback through your configured catalog pipeline."
                : "Binge-ready series catalog with season episode streams through Torrentio + RealDebrid when configured."}
            </p>
            <div className="pulse-cinema-meta">
              {hero.year ? <span>{hero.year}</span> : null}
              <span>{titleGenre(hero)}</span>
              {techBadgesFor(hero).map((b) => (
                <span key={b} className="pulse-badge pulse-badge--ghost">
                  {b}
                </span>
              ))}
            </div>
            <div className="pulse-hero-actions">
              <Link href={hrefFor(hero)} className="accent-btn pulse-cta">
                ▶ Watch Now
              </Link>
              <Link href={hrefFor(hero)} className="ghost-btn pulse-cta-ghost">
                Trailer Preview
              </Link>
              <button type="button" className="ghost-btn pulse-icon-btn" aria-label="Add to list" title="My List">
                +
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <div className="pulse-content">
        <div className="pulse-filter-bar pulse-cinema-filters" role="toolbar" aria-label="Genre filters">
          {CATALOG_GENRES.map((g) => (
            <button
              key={g}
              type="button"
              className={`pulse-chip${genre === g ? " is-active" : ""}`}
              onClick={() => setGenre(g)}
            >
              {g}
            </button>
          ))}
          <span className="pulse-cinema-count">
            <span className="pulse-ok-dot" />
            {visible.length.toLocaleString()} {noun} Online
          </span>
        </div>

        <div className="pulse-cinema-subfilters">
          <div className="pulse-filter-bar" role="group" aria-label="Year">
            {YEAR_FILTERS.map((y) => (
              <button
                key={y.id}
                type="button"
                className={`pulse-chip pulse-chip--sm${year === y.id ? " is-active" : ""}`}
                onClick={() => setYear(y.id)}
              >
                {y.label}
              </button>
            ))}
          </div>
          <label className="pulse-check">
            <input
              type="checkbox"
              checked={uhdOnly}
              onChange={(e) => setUhdOnly(e.target.checked)}
            />
            4K UHD
          </label>
          <label className="pulse-check">
            <input type="checkbox" disabled />
            DOLBY VISION
          </label>
          <label className="pulse-check">
            <input type="checkbox" disabled />
            IMAX ENHANCED
          </label>
        </div>

        {q ? <p className="muted">Search results for “{q}”</p> : null}
        {loading ? (
          <StateBlock title="Loading catalog…" message="Fetching titles from Cinemeta." />
        ) : null}
        {configured === false ? (
          <StateBlock
            tone="warn"
            title="Catalog not configured"
            message="Set STREMIO_ADDON_URL on the API, then restart it."
          />
        ) : null}
        {error ? <StateBlock tone="error" title="Could not load catalog" message={error} /> : null}
        {!loading && !error && configured !== false && visible.length === 0 ? (
          <StateBlock title={`No ${noun.toLowerCase()}`} message="Try another filter or search." />
        ) : null}

        {featured.length > 0 ? (
          <section className="pulse-section">
            <div className="pulse-section-head">
              <h2>
                {kind === "movie"
                  ? "Award Winners & Modern Classics"
                  : "Critically Acclaimed Series"}
              </h2>
            </div>
            <div className="pulse-award-row">
              {featured.map((item, i) => (
                <article key={item.id} className="pulse-award-card">
                  <Link href={hrefFor(item)} className="pulse-award-media">
                    {item.poster ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.poster} alt="" />
                    ) : (
                      <div className="pulse-poster-fallback" />
                    )}
                    <span className="pulse-award-badge">
                      {i === 0 ? "EDITOR'S PICK" : i === 1 ? "TRENDING" : `#${i + 1} PICK`}
                    </span>
                  </Link>
                  <div className="pulse-award-body">
                    <h3>
                      <Link href={hrefFor(item)}>{item.name}</Link>
                    </h3>
                    <p className="muted">
                      {item.year ?? "—"} · ★ {titleRating(item)} · {titleGenre(item)}
                    </p>
                    <p className="pulse-award-blurb">
                      Stream-ready remux through your catalog provider. Open for sources and
                      playback.
                    </p>
                    <div className="pulse-award-foot">
                      <span>{techBadgesFor(item)[0]}</span>
                      <Link href={hrefFor(item)} className="pulse-play-fab" aria-label={`Play ${item.name}`}>
                        ▶
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {pageItems.length > 0 || catalogue.length > 0 ? (
          <section className="pulse-section">
            <div className="pulse-section-head">
              <h2>Full Catalogue</h2>
              <span className="muted">
                {catalogue.length} title{catalogue.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="pulse-catalogue-grid">
              {pageItems.map((item) => (
                <Link key={item.id} href={hrefFor(item)} className="pulse-catalogue-card">
                  <div className="pulse-catalogue-poster">
                    {item.poster ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.poster} alt="" />
                    ) : (
                      <div className="pulse-poster-fallback" />
                    )}
                  </div>
                  <div className="pulse-catalogue-meta">
                    <strong>{item.name}</strong>
                    <span>
                      ★ {titleRating(item)}
                      {item.year ? ` · ${item.year}` : ""}
                    </span>
                  </div>
                </Link>
              ))}
            </div>

            <div className="pulse-pagination">
              <span>
                Viewing {Math.min(catalogue.length, page * PAGE_SIZE + 1)}–
                {Math.min(catalogue.length, (page + 1) * PAGE_SIZE)} of {catalogue.length} {noun}
              </span>
              <div className="pulse-pagination-actions">
                <button
                  type="button"
                  className="ghost-btn"
                  disabled={page <= 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  ←
                </button>
                <button
                  type="button"
                  className="accent-btn"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                >
                  Load Next {PAGE_SIZE} Titles
                </button>
                <button
                  type="button"
                  className="ghost-btn"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                >
                  →
                </button>
              </div>
              <span className="muted">
                Page {page + 1} / {totalPages}
              </span>
            </div>
          </section>
        ) : null}
      </div>
    </SiteShell>
  );
}
