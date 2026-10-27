"use client";

import { useState, type ReactNode } from "react";
import {
  IconBell,
  IconCalendar,
  IconClock,
  IconCompass,
  IconDownload,
  IconHome,
  IconLogout,
  IconMenu,
  IconParty,
  IconSearch,
  IconSettings,
  IconStar,
  IconUsers,
} from "./Icons";
import { BowaLogo } from "./BowaLogo";

export type NavId =
  | "home"
  | "discover"
  | "community"
  | "coming-soon"
  | "recent"
  | "top-rated"
  | "downloaded"
  | "parties"
  | "settings";

type Props = {
  children: ReactNode;
  rail?: ReactNode;
  search: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: () => void;
  activeNav: NavId;
  onNavChange: (id: NavId) => void;
  topTab: "movies" | "tv" | "plans";
  onTopTabChange: (tab: "movies" | "tv" | "plans") => void;
};

const MENU: { id: NavId; label: string; icon: ReactNode; enabled: boolean }[] = [
  { id: "home", label: "Home", icon: <IconHome />, enabled: true },
  { id: "discover", label: "Discover", icon: <IconCompass />, enabled: true },
  { id: "community", label: "Community", icon: <IconUsers />, enabled: false },
  { id: "coming-soon", label: "Coming Soon", icon: <IconCalendar />, enabled: false },
];

const LIBRARY: { id: NavId; label: string; icon: ReactNode; enabled: boolean }[] = [
  { id: "recent", label: "Recent", icon: <IconClock />, enabled: true },
  { id: "top-rated", label: "Top Rated", icon: <IconStar />, enabled: true },
  { id: "downloaded", label: "Downloaded", icon: <IconDownload />, enabled: false },
  { id: "parties", label: "Parties", icon: <IconParty />, enabled: false },
];

export function AppShell({
  children,
  rail,
  search,
  onSearchChange,
  onSearchSubmit,
  activeNav,
  onNavChange,
  topTab,
  onTopTabChange,
}: Props) {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="app-shell">
      <nav className={`side-nav${navOpen ? " open" : ""}`} aria-label="Primary">
        <div className="side-brand">
          <BowaLogo />
        </div>

        <div>
          <div className="nav-section-label">Menu</div>
          {MENU.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-link${activeNav === item.id ? " active" : ""}`}
              disabled={!item.enabled}
              title={item.enabled ? undefined : "Not available in this local build"}
              onClick={() => {
                onNavChange(item.id);
                setNavOpen(false);
              }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>

        <div>
          <div className="nav-section-label">Library</div>
          {LIBRARY.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-link${activeNav === item.id ? " active" : ""}`}
              disabled={!item.enabled}
              title={item.enabled ? undefined : "Not available in this local build"}
              onClick={() => {
                onNavChange(item.id);
                setNavOpen(false);
              }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>

        <div className="nav-spacer" />

        <div>
          <button
            type="button"
            className={`nav-link${activeNav === "settings" ? " active" : ""}`}
            onClick={() => {
              onNavChange("settings");
              setNavOpen(false);
            }}
          >
            <IconSettings /> Settings
          </button>
          <button type="button" className="nav-link" disabled title="Auth not wired">
            <IconLogout /> Logout
          </button>
        </div>
      </nav>

      <header className="top-nav">
        <button
          type="button"
          className="mobile-nav-toggle"
          aria-label="Open navigation"
          onClick={() => setNavOpen((v) => !v)}
        >
          <IconMenu />
        </button>

        <div className="top-tabs" role="tablist" aria-label="Catalog type">
          <button
            type="button"
            role="tab"
            className={`top-tab${topTab === "movies" ? " active" : ""}`}
            aria-selected={topTab === "movies"}
            onClick={() => onTopTabChange("movies")}
          >
            Movies
          </button>
          <button
            type="button"
            role="tab"
            className={`top-tab${topTab === "tv" ? " active" : ""}`}
            aria-selected={topTab === "tv"}
            onClick={() => onTopTabChange("tv")}
          >
            Tv Shows
          </button>
          <button
            type="button"
            role="tab"
            className={`top-tab${topTab === "plans" ? " active" : ""}`}
            aria-selected={topTab === "plans"}
            onClick={() => onTopTabChange("plans")}
            title="Plans are not implemented yet"
          >
            Plans
          </button>
        </div>

        <form
          className="search-pill"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            onSearchSubmit();
          }}
        >
          <IconSearch aria-hidden />
          <input
            type="search"
            name="q"
            placeholder="Search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Search local media"
          />
        </form>

        <div className="top-actions">
          <button type="button" className="icon-btn" aria-label="Notifications" disabled title="Not wired">
            <IconBell />
          </button>
          <div className="profile-chip" title="Local educational session">
            <span className="avatar" aria-hidden>
              B
            </span>
            <span className="profile-meta">
              <strong>Bowa Local</strong>
              <span>private testing</span>
            </span>
          </div>
        </div>
      </header>

      <main className="main-stage">{children}</main>
      <aside className="right-rail" aria-label="Discover">
        {rail}
      </aside>
    </div>
  );
}
