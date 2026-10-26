"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BowaLogo } from "./BowaLogo";
import { HealthBadge } from "./HealthBadge";
import { IconClose, IconMenu, IconSearch } from "./Icons";
import { apiClient } from "@/lib/api-client";
import { BRAND_NAME } from "@/lib/brand";
import type { HealthStatus } from "@frankenstein/shared-types";
import { isApiClientError } from "@/lib/api-error";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/sports", label: "Sports" },
  { href: "/movies", label: "Movies" },
  { href: "/series", label: "Series" },
] as const;

type Props = {
  searchHref?: string;
  searchPlaceholder?: string;
};

export function SiteHeader({
  searchHref = "/movies",
  searchPlaceholder = "Search library",
}: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setHealthLoading(true);
      try {
        const h = await apiClient.getHealth();
        if (!cancelled) {
          setHealth(h);
          setHealthError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setHealth(null);
          setHealthError(isApiClientError(err) ? err.message : "Health check failed");
        }
      } finally {
        if (!cancelled) setHealthLoading(false);
      }
    }
    void load();
    const id = window.setInterval(() => void load(), 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="site-brand" aria-label={`${BRAND_NAME} home`}>
          <BowaLogo />
        </Link>

        <nav className="site-nav desktop-nav" aria-label="Primary">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`site-nav-link${isActive(item.href) ? " active" : ""}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <form
          className="site-search"
          role="search"
          action={searchHref}
          method="get"
          onSubmit={(e) => {
            if (!query.trim()) e.preventDefault();
          }}
        >
          <IconSearch aria-hidden />
          <input
            type="search"
            name="q"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
          />
        </form>

        <div className="site-header-actions">
          <HealthBadge health={health} loading={healthLoading} error={healthError} />
          <button
            type="button"
            className="icon-btn mobile-only"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <IconClose /> : <IconMenu />}
          </button>
        </div>
      </div>

      {open ? (
        <nav className="mobile-drawer" aria-label="Mobile">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`site-nav-link${isActive(item.href) ? " active" : ""}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </header>
  );
}
