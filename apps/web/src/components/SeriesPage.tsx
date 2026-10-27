"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { CatalogTitle } from "@frankenstein/shared-types";
import { CatalogLanding } from "./CatalogLanding";
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
    <CatalogLanding
      kind="series"
      items={items}
      loading={loading}
      error={error}
      configured={configured}
      hrefFor={(item) => `/series/${encodeURIComponent(item.id)}`}
    />
  );
}
