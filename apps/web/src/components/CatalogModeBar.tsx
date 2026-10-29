import Link from "next/link";

type Mode = "movie" | "series" | "sports";

type Props = {
  active: Mode;
  /** Optional live bitrate label for the pipeline chip */
  bitrateMbps?: string;
};

export function CatalogModeBar({ active, bitrateMbps }: Props) {
  return (
    <div className="pulse-mode-bar">
      <div className="pulse-mode-pills" role="tablist" aria-label="Catalog mode">
        <Link
          href="/movies"
          className={`pulse-mode-pill${active === "movie" ? " is-active" : ""}`}
          aria-current={active === "movie" ? "page" : undefined}
        >
          Movie Mode
        </Link>
        <Link
          href="/series"
          className={`pulse-mode-pill${active === "series" ? " is-active" : ""}`}
          aria-current={active === "series" ? "page" : undefined}
        >
          TV Series Mode
        </Link>
        <Link
          href="/sports"
          className={`pulse-mode-pill${active === "sports" ? " is-active" : ""}`}
          aria-current={active === "sports" ? "page" : undefined}
        >
          Live Sports Mode
        </Link>
      </div>
      <div className="pulse-mode-status">
        <span className="pulse-pipeline">
          <span className="pulse-ok-dot" />
          LOW LATENCY HDR10+ PIPELINE
          {bitrateMbps ? ` (${bitrateMbps} Mbps)` : ""}
        </span>
        <span className="pulse-badge pulse-badge--ghost">DOLBY ATMOS</span>
        <span className="pulse-badge pulse-badge--ghost">VISION 4K</span>
      </div>
    </div>
  );
}
