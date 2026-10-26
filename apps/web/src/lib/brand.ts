/** Configurable product name — set NEXT_PUBLIC_BRAND_NAME to override. */
export const BRAND_NAME =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_BRAND_NAME?.trim()) ||
  "Bowa";

export const BRAND_TAGLINE = "Sports, movies, and series in one place.";
