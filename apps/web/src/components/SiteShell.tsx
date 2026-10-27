import type { ReactNode } from "react";
import Link from "next/link";
import { SiteHeader } from "./SiteHeader";
import { BowaLogo } from "./BowaLogo";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";

type Props = {
  children: ReactNode;
  searchHref?: string;
  searchPlaceholder?: string;
  /** Full-bleed main (Pulse sports pages). */
  flush?: boolean;
  /** Richer Pulse-style footer columns. */
  pulseFooter?: boolean;
};

export function SiteShell({
  children,
  searchHref,
  searchPlaceholder,
  flush = false,
  pulseFooter = false,
}: Props) {
  return (
    <div className="site-shell">
      <SiteHeader searchHref={searchHref} searchPlaceholder={searchPlaceholder} />
      <main className={flush ? "site-main site-main--flush" : "site-main"}>{children}</main>
      {pulseFooter ? (
        <footer className="pulse-footer">
          <div className="pulse-footer-inner">
            <div className="pulse-footer-brand">
              <BowaLogo />
              <p>{BRAND_TAGLINE}</p>
            </div>
            <div className="pulse-footer-cols">
              <div>
                <h3>Categories</h3>
                <Link href="/sports">Live Sports</Link>
                <Link href="/movies">Movies</Link>
                <Link href="/series">Series</Link>
                <Link href="/list">My List</Link>
              </div>
              <div>
                <h3>Experience</h3>
                <span>Live Multi-Cam</span>
                <span>Spatial Audio Hub</span>
                <span>Supported Devices</span>
                <span>Speed Test</span>
              </div>
              <div>
                <h3>Applications</h3>
                <span>Desktop / Web</span>
                <span>Smart TV / Apple TV</span>
                <Link href="/sports">Open Sports Hub</Link>
              </div>
            </div>
          </div>
          <div className="pulse-footer-bar">
            <span>© {new Date().getFullYear()} {BRAND_NAME}</span>
            <span>Privacy · Terms · Help</span>
          </div>
        </footer>
      ) : null}
    </div>
  );
}
