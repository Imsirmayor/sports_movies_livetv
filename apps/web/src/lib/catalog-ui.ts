import type { CatalogTitle } from "@frankenstein/shared-types";

const GENRE_POOL = [
  "Action & Heist",
  "Sci-Fi & Cyberpunk",
  "Drama & Awards",
  "Thriller & Neo-Noir",
  "Comedy & Feel-Good",
  "Animation & Family",
] as const;

export type CatalogGenre = (typeof GENRE_POOL)[number] | "All Genres";

export const CATALOG_GENRES: CatalogGenre[] = ["All Genres", ...GENRE_POOL];

export const YEAR_FILTERS = [
  { id: "all", label: "All years" },
  { id: "2024", label: "2024–2025" },
  { id: "2020", label: "2020–2023" },
  { id: "2010", label: "2010–2019" },
  { id: "earlier", label: "Before 2010" },
] as const;

export type YearFilterId = (typeof YEAR_FILTERS)[number]["id"];

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h;
}

/** Stable faux genre for catalog titles that lack genre metadata. */
export function titleGenre(item: CatalogTitle): (typeof GENRE_POOL)[number] {
  return GENRE_POOL[hashName(item.name) % GENRE_POOL.length]!;
}

export function titleMatchPct(item: CatalogTitle): number {
  return 86 + (hashName(item.name) % 13);
}

export function titleRating(item: CatalogTitle): string {
  const n = 7.2 + (hashName(item.id) % 20) / 10;
  return n.toFixed(1);
}

export function parseYear(item: CatalogTitle): number | null {
  const y = Number(item.year);
  return Number.isFinite(y) && y > 1900 ? y : null;
}

export function matchesYearFilter(item: CatalogTitle, filter: YearFilterId): boolean {
  if (filter === "all") return true;
  const y = parseYear(item);
  if (y == null) return true;
  if (filter === "2024") return y >= 2024;
  if (filter === "2020") return y >= 2020 && y <= 2023;
  if (filter === "2010") return y >= 2010 && y <= 2019;
  return y < 2010;
}

export function filterCatalog(
  items: CatalogTitle[],
  opts: { genre: CatalogGenre; year: YearFilterId; q?: string }
): CatalogTitle[] {
  const q = opts.q?.trim().toLowerCase() ?? "";
  return items.filter((item) => {
    if (opts.genre !== "All Genres" && titleGenre(item) !== opts.genre) return false;
    if (!matchesYearFilter(item, opts.year)) return false;
    if (q && !item.name.toLowerCase().includes(q) && !item.id.toLowerCase().includes(q)) {
      return false;
    }
    return true;
  });
}

export function techBadgesFor(item: CatalogTitle): string[] {
  const h = hashName(item.id);
  const badges = ["4K ULTRA HD"];
  if (h % 2 === 0) badges.push("DOLBY VISION");
  if (h % 3 === 0) badges.push("ATMOS 7.1");
  else badges.push("HDR10+");
  if (h % 5 === 0) badges.push("IMAX ENHANCED");
  return badges;
}

const CAST_POOL = [
  ["Lead Performer", "Primary role"],
  ["Co-Star", "Supporting lead"],
  ["Ensemble", "Featured cast"],
] as const;

const SOUNDTRACK_POOL = [
  ["Main Theme Suite", "Score ensemble"],
  ["Night Drive Motif", "Synth orchestra"],
  ["End Titles", "Studio orchestra"],
] as const;

const TRIVIA_POOL = [
  "Practical effects and atmosphere lighting were prioritized for key sequences.",
  "Production mixed location plates with controlled stage environments.",
  "The remux pipeline preserves the theatrical audio layout when available.",
] as const;

const LOCATION_POOL = [
  "Studio stages · principal photography",
  "Urban night plates · second unit",
  "Soundstage interiors · ADR unit",
] as const;

/** Cosmetic X-Ray panel content for cinema detail (catalog has no cast API). */
export function titleXray(item: CatalogTitle) {
  const h = hashName(item.id);
  const cast = CAST_POOL.map((pair, i) => ({
    name: pair[0],
    role: pair[1],
    initial: String.fromCharCode(65 + ((h + i * 7) % 26)),
  }));
  const track = SOUNDTRACK_POOL[h % SOUNDTRACK_POOL.length]!;
  return {
    cast,
    soundtrack: { title: track[0], artist: track[1] },
    trivia: TRIVIA_POOL[h % TRIVIA_POOL.length]!,
    location: LOCATION_POOL[h % LOCATION_POOL.length]!,
    runtime: `${1 + (h % 2)}h ${20 + (h % 40)}m`,
    ratingLabel: h % 2 === 0 ? "TV-MA" : "R",
    bitrateMbps: (14 + (h % 12) + (h % 10) / 10).toFixed(1),
  };
}

export function relatedBlurb(item: CatalogTitle): string {
  return `${titleGenre(item)} narrative ready for remux playback from your catalog pipeline.`;
}
