import { BRAND_NAME } from "@/lib/brand";

type Props = {
  size?: number;
  showWordmark?: boolean;
};

/** Pulse Stream equalizer mark + configurable wordmark */
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
        <defs>
          <linearGradient id="pulseMarkGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#4A90E2" />
            <stop offset="100%" stopColor="#7B61FF" />
          </linearGradient>
        </defs>
        <rect width="48" height="48" rx="12" fill="url(#pulseMarkGrad)" />
        <g fill="#fff">
          <rect x="11" y="22" width="4" height="12" rx="2" />
          <rect x="17.5" y="16" width="4" height="18" rx="2" />
          <rect x="24" y="12" width="4" height="22" rx="2" />
          <rect x="30.5" y="18" width="4" height="16" rx="2" />
          <rect x="37" y="20" width="4" height="14" rx="2" />
        </g>
      </svg>
      {showWordmark ? (
        <span className="bowa-logo-text">
          {BRAND_NAME.includes(" ") ? (
            <>
              {BRAND_NAME.split(" ")[0]}{" "}
              <span className="bowa-dot">{BRAND_NAME.split(" ").slice(1).join(" ")}</span>
            </>
          ) : (
            BRAND_NAME
          )}
        </span>
      ) : null}
    </span>
  );
}
