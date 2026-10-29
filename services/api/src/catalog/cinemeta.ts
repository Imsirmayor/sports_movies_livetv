/**
 * Cinemeta catalogs — search + top lists (same sources the Discord bot / Stremio use).
 */

export type CatalogTitle = {
  id: string;
  name: string;
  type: "movie" | "series";
  year?: string;
  poster?: string | null;
};

type CinemetaMeta = {
  id?: string;
  imdb_id?: string;
  name: string;
  type?: string;
  year?: string;
  releaseInfo?: string;
  poster?: string;
};

type CinemetaCatalogResponse = {
  metas?: CinemetaMeta[];
};

const SEARCH_BASE = "https://v3-cinemeta.strem.io";
const TOP_BASE = "https://cinemeta-catalogs.strem.io/top/catalog";

function normalizeTitle(m: CinemetaMeta, fallbackType: "movie" | "series"): CatalogTitle | null {
  const id = m.imdb_id || m.id;
  if (!id || !m.name) return null;
  const type =
    m.type === "series" || m.type === "movie" ? m.type : fallbackType;
  return {
    id,
    name: m.name,
    type,
    year: m.year ?? m.releaseInfo,
    poster: m.poster ?? null,
  };
}

async function fetchJson(url: string, attempts = 3): Promise<unknown> {
  let lastErr: Error | null = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(20_000),
        redirect: "follow",
        headers: { Accept: "application/json" },
      });
      if (res.status === 504 || res.status === 502 || res.status === 429) {
        lastErr = new Error(`Cinemeta error: ${res.status}`);
        await new Promise((r) => setTimeout(r, 400 * (i + 1)));
        continue;
      }
      if (!res.ok) {
        throw new Error(`Cinemeta error: ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 400 * (i + 1)));
      }
    }
  }
  throw lastErr ?? new Error("Cinemeta request failed");
}

async function searchByType(
  query: string,
  type: "movie" | "series"
): Promise<CatalogTitle[]> {
  const encoded = encodeURIComponent(query.trim());
  if (!encoded) return [];

  const data = (await fetchJson(
    `${SEARCH_BASE}/catalog/${type}/top/search=${encoded}.json`
  )) as CinemetaCatalogResponse;

  return (data.metas ?? [])
    .map((m) => normalizeTitle(m, type))
    .filter((m): m is CatalogTitle => Boolean(m));
}

export async function searchMovies(query: string): Promise<CatalogTitle[]> {
  return searchByType(query, "movie");
}

export async function searchSeries(query: string): Promise<CatalogTitle[]> {
  return searchByType(query, "series");
}

export async function listTopMovies(limit = 40): Promise<CatalogTitle[]> {
  const data = (await fetchJson(`${TOP_BASE}/movie/top.json`)) as CinemetaCatalogResponse;
  return (data.metas ?? [])
    .map((m) => normalizeTitle(m, "movie"))
    .filter((m): m is CatalogTitle => Boolean(m))
    .slice(0, limit);
}

export async function listTopSeries(limit = 40): Promise<CatalogTitle[]> {
  const data = (await fetchJson(`${TOP_BASE}/series/top.json`)) as CinemetaCatalogResponse;
  return (data.metas ?? [])
    .map((m) => normalizeTitle(m, "series"))
    .filter((m): m is CatalogTitle => Boolean(m))
    .slice(0, limit);
}

export type SeriesEpisode = {
  season: number;
  episode: number;
  name: string;
  overview?: string | null;
  released?: string | null;
};

export type SeriesMeta = CatalogTitle & {
  episodes: SeriesEpisode[];
  seasons: number[];
};

export async function getMovieMeta(imdbId: string): Promise<CatalogTitle | null> {
  try {
    const data = (await fetchJson(
      `${SEARCH_BASE}/meta/movie/${encodeURIComponent(imdbId)}.json`
    )) as { meta?: CinemetaMeta };
    if (!data.meta) return null;
    return normalizeTitle({ ...data.meta, type: "movie" }, "movie");
  } catch (err) {
    if (err instanceof Error && err.message.includes("404")) return null;
    throw err;
  }
}

export async function getSeriesMeta(imdbId: string): Promise<SeriesMeta | null> {
  const data = (await fetchJson(
    `${SEARCH_BASE}/meta/series/${encodeURIComponent(imdbId)}.json`
  )) as {
    meta?: CinemetaMeta & {
      videos?: Array<{
        season: number;
        episode: number;
        name?: string;
        overview?: string;
        released?: string;
      }>;
    };
  };
  if (!data.meta) return null;

  const base = normalizeTitle({ ...data.meta, type: "series" }, "series");
  if (!base) return null;

  const episodes: SeriesEpisode[] = (data.meta.videos ?? [])
    .filter((v) => v.season > 0)
    .map((v) => ({
      season: v.season,
      episode: v.episode,
      name: v.name ?? `Episode ${v.episode}`,
      overview: v.overview ?? null,
      released: v.released ?? null,
    }))
    .sort((a, b) => a.season - b.season || a.episode - b.episode);

  const seasons = [...new Set(episodes.map((e) => e.season))].sort((a, b) => a - b);

  return { ...base, episodes, seasons };
}
