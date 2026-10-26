import { BRAND_NAME } from "@/lib/brand";

type Props = {
  size?: number;
  showWordmark?: boolean;
};

/** Bow-tie mark + configurable wordmark */
export function BowaLogo({ size = 28, showWordmark = true }: Props) {
  return (
    <span className="bowa-logo" aria-label={BRAND_NAME}>
      <svg
        className="bowa-logo-mark"
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        aria-hidden
      >
        <rect width="48" height="48" rx="12" fill="url(#bowaGrad)" />
        <path d="M10 18 L22 24 L10 30 Z" fill="#fff" opacity="0.95" />
        <path d="M38 18 L26 24 L38 30 Z" fill="#fff" opacity="0.95" />
        <rect x="20.5" y="20.5" width="7" height="7" rx="2" fill="#1a1a1d" />
        <rect x="22" y="22" width="4" height="4" rx="1" fill="#fff" opacity="0.85" />
        <defs>
          <linearGradient id="bowaGrad" x1="8" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ff7a45" />
            <stop offset="1" stopColor="#ff4d2e" />
          </linearGradient>
        </defs>
      </svg>
      {showWordmark ? (
        <span className="bowa-logo-text">
          {BRAND_NAME}
          <span className="bowa-dot">.</span>
        </span>
      ) : null}
    </span>
  );
}
