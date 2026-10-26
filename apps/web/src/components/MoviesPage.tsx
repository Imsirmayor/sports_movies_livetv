"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { CatalogTitle, MediaItem } from "@frankenstein/shared-types";
import { SiteShell } from "./SiteShell";
import { CatalogGrid } from "./CatalogGrid";
import { MediaCard } from "./MediaCard";
import { SkeletonGrid, StateBlock } from "./StateBlock";
import { apiClient } from "@/lib/api-client";
import { isApiClientError } from "@/lib/api-error";

export function MoviesPage() {
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const [catalog, setCatalog] = useState<CatalogTitle[]>([]);
  const [local, setLocal] = useState<MediaItem[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [showLocal, setShowLocal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setCatalogError(null);
      try {
        if (q.trim()) {
          const cat = await apiClient.searchCatalogMovies(q.trim());
          if (!cancelled) {
            setCatalog(cat.items);
            setConfigured(cat.providerConfigured);
          }
        } else {
          const cat = await apiClient.listCatalogMovies();
          if (!cancelled) {
            setCatalog(cat.items);
            setConfigured(cat.providerConfigured);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setCatalog([]);
          setCatalogError(isApiClientError(err) ? err.message : "Catalog failed");
        }
      }

      try {
        const list = await apiClient.listMedia();
        if (!cancelled) setLocal(list);
      } catch {
        if (!cancelled) setLocal([]);
      }

      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [q]);

  return (
    <SiteShell searchHref="/movies" searchPlaceholder="Search movies (Cinemeta)">
      <div className="page-hero">
        <h1>Movies</h1>
        <p>
          Live catalog from Cinemeta. Watch uses Torrentio + RealDebrid via{" "}
          <code>STREMIO_ADDON_URL</code> (same as the Discord bot).
        </p>
      </div>

      {q ? <p className="muted">Search results for “{q}”</p> : <p className="muted">Popular movies</p>}
      {loading ? <SkeletonGrid count={8} /> : null}

      {configured === false ? (
        <StateBlock
          tone="warn"
          title="Catalog not configured"
          message="Set STREMIO_ADDON_URL on the API, then restart it."
        />
      ) : null}
      {catalogError ? (
        <StateBlock tone="error" title="Could not load catalog" message={catalogError} />
      ) : null}
      {!loading && !catalogError && configured !== false && catalog.length === 0 ? (
        <StateBlock title="No movies" message="Try another search." />
      ) : null}
      {!loading && catalog.length > 0 ? (
        <CatalogGrid
          items={catalog}
          actionLabel="Streams"
          hrefFor={(item) => `/movies/catalog/${encodeURIComponent(item.id)}`}
        />
      ) : null}

      <section className="content-section" style={{ marginTop: "2rem" }}>
        <div className="section-head">
          <h2>Local samples</h2>
          <button type="button" className="ghost-btn" onClick={() => setShowLocal((v) => !v)}>
            {showLocal ? "Hide" : "Show"} ({local.length})
          </button>
        </div>
        {showLocal && local.length > 0 ? (
          <div className="card-grid media-grid">
            {local.map((item) => (
              <MediaCard key={item.id} item={item} />
            ))}
          </div>
        ) : null}
        {showLocal && local.length === 0 ? (
          <StateBlock title="No local files" message="MEDIA_ROOT is empty." />
        ) : null}
      </section>
    </SiteShell>
  );
}
