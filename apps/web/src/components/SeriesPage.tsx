"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { CatalogTitle } from "@frankenstein/shared-types";
import { SiteShell } from "./SiteShell";
import { CatalogGrid } from "./CatalogGrid";
import { SkeletonGrid, StateBlock } from "./StateBlock";
import { apiClient } from "@/lib/api-client";
import { isApiClientError } from "@/lib/api-error";

export function SeriesPage() {
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const [items, setItems] = useState<CatalogTitle[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = q.trim()
          ? await apiClient.searchCatalogSeries(q.trim())
          : await apiClient.listCatalogSeries();
        if (!cancelled) {
          setItems(res.items);
          setConfigured(res.providerConfigured);
        }
      } catch (err) {
        if (!cancelled) {
          setItems([]);
          setError(isApiClientError(err) ? err.message : "Series catalog failed");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [q]);

  return (
    <SiteShell searchHref="/series" searchPlaceholder="Search TV series">
      <div className="page-hero">
        <h1>Series</h1>
        <p>
          Live Cinemeta catalog. Episodes stream through Torrentio + RealDebrid when configured.
        </p>
      </div>

      {q ? <p className="muted">Search results for “{q}”</p> : <p className="muted">Popular series</p>}
      {loading ? <SkeletonGrid count={8} /> : null}
      {configured === false ? (
        <StateBlock
          tone="warn"
          title="Catalog not configured"
          message="Set STREMIO_ADDON_URL on the API, then restart it."
        />
      ) : null}
      {error ? <StateBlock tone="error" title="Could not load series" message={error} /> : null}
      {!loading && !error && configured !== false && items.length === 0 ? (
        <StateBlock title="No series" message="Try another search." />
      ) : null}
      {!loading && items.length > 0 ? (
        <CatalogGrid
          items={items}
          actionLabel="Episodes"
          hrefFor={(item) => `/series/${encodeURIComponent(item.id)}`}
        />
      ) : null}
    </SiteShell>
  );
}
