"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { CatalogTitle } from "@frankenstein/shared-types";
import { CatalogLanding } from "./CatalogLanding";
import { apiClient } from "@/lib/api-client";
import { isApiClientError } from "@/lib/api-error";

export function MoviesPage() {
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const [catalog, setCatalog] = useState<CatalogTitle[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setCatalogError(null);
      try {
        const cat = q.trim()
          ? await apiClient.searchCatalogMovies(q.trim())
          : await apiClient.listCatalogMovies();
        if (!cancelled) {
          setCatalog(cat.items);
          setConfigured(cat.providerConfigured);
        }
      } catch (err) {
        if (!cancelled) {
          setCatalog([]);
          setCatalogError(isApiClientError(err) ? err.message : "Catalog failed");
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
    <CatalogLanding
      kind="movie"
      items={catalog}
      loading={loading}
      error={catalogError}
      configured={configured}
      hrefFor={(item) => `/movies/catalog/${encodeURIComponent(item.id)}`}
    />
  );
}
