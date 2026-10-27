"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BowaLogo } from "./BowaLogo";
import { IconClose, IconMenu, IconSearch } from "./Icons";
import { BRAND_NAME } from "@/lib/brand";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/sports", label: "Sports" },
  { href: "/movies", label: "Movies" },
  { href: "/series", label: "Series" },
  { href: "/list", label: "My List" },
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
