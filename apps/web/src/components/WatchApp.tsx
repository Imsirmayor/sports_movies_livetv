"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MediaItem, PlaybackSession } from "@frankenstein/shared-types";
import { apiClient } from "@/lib/api-client";
import { isApiClientError } from "@/lib/api-error";
import { AppShell, type NavId } from "./AppShell";
import { HlsPlayer } from "./HlsPlayer";
import { MediaList } from "./MediaList";
import { IconPlay } from "./Icons";

const GENRES = ["Action", "Romance", "Comedy", "Crime", "Fantasy", "Drama", "Mystery", "Sports"] as const;

function errMessage(err: unknown): string {
  if (isApiClientError(err)) return `${err.code}: ${err.message}`;
  if (err instanceof Error) return err.message;
  return "Unexpected error";
}

export function WatchApp() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [mediaLoading, setMediaLoading] = useState(true);
  const [mediaError, setMediaError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [activeNav, setActiveNav] = useState<NavId>("home");
  const [topTab, setTopTab] = useState<"movies" | "tv" | "plans">("movies");
  const [genre, setGenre] = useState<(typeof GENRES)[number]>("Action");

  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [session, setSession] = useState<PlaybackSession | null>(null);
  const [playlistUrl, setPlaylistUrl] = useState<string | null>(null);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [playerError, setPlayerError] = useState<string | null>(null);

  const loadMedia = useCallback(async (q: string) => {
    setMediaLoading(true);
    setMediaError(null);
    try {
      if (q.trim()) {
        const res = await apiClient.searchMedia(q.trim());
        setItems(res.items);
      } else {
        setItems(await apiClient.listMedia());
      }
    } catch (err) {
      setItems([]);
      setMediaError(errMessage(err));
    } finally {
      setMediaLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMedia("");
  }, [loadMedia]);

  useEffect(() => {
    if (!session || session.status !== "starting") return;
    let cancelled = false;
    const poll = async () => {
      try {
        const next = await apiClient.getPlayback(session.sessionId);
        if (cancelled) return;
        setSession(next);
        setPlaylistUrl(apiClient.toProxiedPlaylistUrl(next.playlistUrl));
        if (next.status === "failed") {
          setSessionError(next.errorMessage ?? "Playback failed");
        }
      } catch (err) {
        if (!cancelled) setSessionError(errMessage(err));
      }
    };
    const id = window.setInterval(() => void poll(), 500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [session]);

  const featured = selected ?? items[0] ?? null;

  const sortedItems = useMemo(() => {
    const copy = [...items];
    if (activeNav === "top-rated") {
      copy.sort((a, b) => b.sizeBytes - a.sizeBytes);
    } else if (activeNav === "recent") {
      copy.sort((a, b) => a.title.localeCompare(b.title));
    }
    return copy;
  }, [items, activeNav]);

  const sectionLabel = useMemo(() => {
    if (query.trim()) return `Search · “${query.trim()}”`;
    if (activeNav === "discover") return "Discover · local catalog";
    if (activeNav === "recent") return "Recent · local files";
    if (activeNav === "top-rated") return "Top Rated · by file size (local proxy)";
    if (topTab === "tv") return "Tv Shows · local samples";
    if (topTab === "plans") return "Plans · not available in local build";
    return "Continue Watching · local samples";
  }, [query, activeNav, topTab]);

  const startSession = async (item: MediaItem) => {
    setSelected(item);
    setSessionError(null);
    setPlayerError(null);
    setSessionBusy(true);
    try {
      if (session && session.status !== "stopped") {
        try {
          await apiClient.stopPlayback(session.sessionId);
        } catch {
          /* best-effort */
        }
      }
      const created = await apiClient.startPlayback(item.id);
      setSession(created);
      setPlaylistUrl(apiClient.toProxiedPlaylistUrl(created.playlistUrl));
    } catch (err) {
      setSession(null);
      setPlaylistUrl(null);
      setSessionError(errMessage(err));
    } finally {
      setSessionBusy(false);
    }
  };

  const stopSession = async () => {
    if (!session) return;
    setSessionBusy(true);
    setSessionError(null);
    try {
      const stopped = await apiClient.stopPlayback(session.sessionId);
      setSession(stopped);
      setPlaylistUrl(null);
    } catch (err) {
      setSessionError(errMessage(err));
    } finally {
      setSessionBusy(false);
    }
  };

  const diagnostics = {
    activeNav,
    topTab,
    genre,
    selected,
    session,
    playlistUrl,
    playerError,
    sessionError,
  };

  return (
    <AppShell
      search={search}
      onSearchChange={setSearch}
      onSearchSubmit={() => {
        setQuery(search);
        setActiveNav("discover");
        void loadMedia(search);
      }}
      activeNav={activeNav}
      onNavChange={(id) => {
        setActiveNav(id);
        if (id === "discover" || id === "home" || id === "recent" || id === "top-rated") {
          void loadMedia(query);
        }
      }}
      topTab={topTab}
      onTopTabChange={setTopTab}
      rail={
        <>
          <div className="nav-section-label">Genre</div>
          <div className="genre-grid" role="group" aria-label="Genre filters">
            {GENRES.map((g) => (
              <button
                key={g}
                type="button"
                className={`genre-chip${genre === g ? " active" : ""}`}
                onClick={() => setGenre(g)}
                aria-pressed={genre === g}
              >
                {g}
              </button>
            ))}
          </div>
          <p style={{ margin: "0 0 0.85rem", color: "var(--text-muted)", fontSize: "0.78rem" }}>
            Genre chips are visual for this local build. Catalog still comes from{" "}
            <code>MEDIA_ROOT</code>.
          </p>
          <div className="nav-section-label">Popular Movies</div>
          <h2 style={{ margin: "0 0 0.75rem", fontSize: "1.05rem" }}>Local samples</h2>
          {mediaLoading ? (
            <div className="state-panel" role="status">
              <h2>Loading…</h2>
              <p>Fetching sample media.</p>
            </div>
          ) : mediaError ? (
            <div className="state-panel error" role="alert">
              <h2>Could not load media</h2>
              <p>{mediaError}</p>
              <p style={{ marginTop: "0.75rem" }}>
                <button type="button" className="ghost-btn" onClick={() => void loadMedia(query)}>
                  Retry
                </button>
              </p>
            </div>
          ) : (
            <MediaList
              items={sortedItems}
              selectedId={selected?.id ?? null}
              onSelect={(item) => void startSession(item)}
              emptyMessage={
                query ? "No local files matched that search." : "Run `pnpm sample:generate` then refresh."
              }
            />
          )}
          <button
            type="button"
            className="accent-btn"
            style={{ width: "100%", justifyContent: "center", marginTop: "1rem" }}
            disabled={!featured || sessionBusy}
            onClick={() => featured && void startSession(featured)}
          >
            See More / Watch
          </button>
        </>
      }
    >
      {activeNav === "settings" ? (
        <section className="meta-block" aria-label="Settings">
          <h1>Settings</h1>
          <p style={{ color: "var(--text-muted)" }}>
            Private educational build. Playback diagnostics are below. No account logout or remote
            plans are wired.
          </p>
          <details className="diagnostics" open>
            <summary>Developer diagnostics</summary>
            <pre>{JSON.stringify(diagnostics, null, 2)}</pre>
          </details>
        </section>
      ) : (
        <>
          <section className="hero-banner" aria-label="Featured">
            <span className="status-chip">{genre} · local</span>
            <h1>{featured?.title ?? "Bowa Local Library"}</h1>
            <p>
              {featured
                ? `Ready to stream ${featured.filename} through the authenticated HLS worker.`
                : "Add a sample under media/samples to begin. Remote catalogs are not connected."}
            </p>
            <div className="hero-actions">
              <button
                type="button"
                className="accent-btn"
                disabled={!featured || sessionBusy}
                onClick={() => featured && void startSession(featured)}
              >
                <IconPlay size={14} /> Watch Now
              </button>
              <button
                type="button"
                className="ghost-btn"
                disabled={!session || session.status === "stopped" || sessionBusy}
                onClick={() => void stopSession()}
              >
                Stop session
              </button>
              <span className="status-chip">
                {session ? `Session ${session.status}` : "No active session"}
              </span>
            </div>
          </section>

          <h2 className="section-title">{sectionLabel}</h2>
          {mediaLoading ? (
            <div className="state-panel" role="status">
              <h2>Loading media…</h2>
              <p>Fetching the configured sample directory.</p>
            </div>
          ) : mediaError ? (
            <div className="state-panel error" role="alert">
              <h2>Could not load media</h2>
              <p>{mediaError}</p>
            </div>
          ) : topTab === "plans" ? (
            <div className="state-panel" role="status">
              <h2>Plans</h2>
              <p>Subscription plans from the design reference are not implemented in this local build.</p>
            </div>
          ) : (
            <MediaList
              variant="cards"
              items={sortedItems}
              selectedId={selected?.id ?? null}
              onSelect={(item) => void startSession(item)}
              emptyMessage={
                query ? "No local files matched that search." : "Run `pnpm sample:generate` then refresh."
              }
            />
          )}

          <h2 className="section-title">Now Playing</h2>
          <HlsPlayer
            src={session?.status === "ready" || session?.status === "starting" ? playlistUrl : null}
            title={selected?.title ?? "No media selected"}
            subtitle={
              session
                ? `Session ${session.status}${session.ffmpegPid ? ` · pid ${session.ffmpegPid}` : ""}`
                : "Press Watch Now on a sample to start an API playback session"
            }
            onNativeError={setPlayerError}
            onStop={() => void stopSession()}
            stopping={sessionBusy}
          />

          <div className="meta-block">
            <div className="meta-row">
              <button
                type="button"
                className="accent-btn"
                disabled={!selected || sessionBusy}
                onClick={() => selected && void startSession(selected)}
              >
                {session && session.status !== "stopped" ? "Restart playback" : "Start playback"}
              </button>
              <button type="button" className="ghost-btn" onClick={() => void loadMedia(query)}>
                Refresh catalog
              </button>
            </div>
          </div>

          {sessionError ? (
            <div className="state-panel error" role="alert">
              <h2>Playback API error</h2>
              <p>{sessionError}</p>
            </div>
          ) : null}
          {playerError ? (
            <div className="state-panel error" role="alert">
              <h2>Player error</h2>
              <p>{playerError}</p>
            </div>
          ) : null}

          <details className="diagnostics">
            <summary>Developer diagnostics</summary>
            <pre>{JSON.stringify(diagnostics, null, 2)}</pre>
          </details>
        </>
      )}
    </AppShell>
  );
}
