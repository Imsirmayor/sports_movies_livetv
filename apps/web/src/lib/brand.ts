/** Configurable product name — set NEXT_PUBLIC_BRAND_NAME to override. */
export const BRAND_NAME =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_BRAND_NAME?.trim()) ||
  "PULSE STREAM";

export const BRAND_TAGLINE =
  "Live sports, cinema, and series — ultra-low latency streaming.";
