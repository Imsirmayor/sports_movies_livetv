"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { CatalogStreamOption, CatalogTitle, SeriesMeta } from "@frankenstein/shared-types";
import { SiteShell } from "./SiteShell";
import { StateBlock } from "./StateBlock";
import { CatalogModeBar } from "./CatalogModeBar";
import { apiClient } from "@/lib/api-client";
import { isApiClientError } from "@/lib/api-error";
import {
  clearContinueWatch,
  formatResumeLabel,
  getContinueWatch,
  seriesProgressId,
  type ContinueWatchEntry,
} from "@/lib/continue-watching";
import {
  getPreferredAudioLang,
  getPreferredSubtitleLang,
  setPreferredAudioLang,
  setPreferredSubtitleLang,
  streamMatchesAudioPref,
} from "@/lib/playback-prefs";
import { techBadgesFor, titleGenre, titleRating } from "@/lib/catalog-ui";

type Props = { imdbId: string };

const AUDIO_PRESETS = ["any", "ENG", "SPA", "FRE", "GER", "ITA", "POR", "RUS", "JPN", "Multi"];

export function SeriesDetail({ imdbId }: Props) {
  const [series, setSeries] = useState<SeriesMeta | null>(null);
  const [related, setRelated] = useState<CatalogTitle[]>([]);
  const [season, setSeason] = useState<number | null>(null);
  const [selectedEp, setSelectedEp] = useState<{
    season: number;
    episode: number;
    name: string;
  } | null>(null);
  const [streams, setStreams] = useState<CatalogStreamOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  const [prepareMsg, setPrepareMsg] = useState<string | null>(null);
  const [loadingStreams, setLoadingStreams] = useState(false);
  const [saved, setSaved] = useState<ContinueWatchEntry | null>(null);
  const [resumeFromSaved, setResumeFromSaved] = useState(true);
  const [audioLang, setAudioLang] = useState("ENG");
  const [subLang, setSubLang] = useState("eng");
  const [iframeSrc, setIframeSrc] = useState<string | null>(null);
  const [iframeReady, setIframeReady] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sideTab, setSideTab] = useState<"episodes" | "sources" | "stats">("episodes");
  const [cinemaMode, setCinemaMode] = useState(false);

  useEffect(() => {
    setAudioLang(getPreferredAudioLang());
    setSubLang(getPreferredSubtitleLang());
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [meta, list] = await Promise.all([
          apiClient.getCatalogSeries(imdbId),
          apiClient.listCatalogSeries().catch(() => null),
        ]);
        if (cancelled) return;
        setSeries(meta);
        const firstSeason = meta.seasons[0] ?? null;
        setSeason(firstSeason);
        setRelated((list?.items ?? []).filter((x) => x.id !== meta.id).slice(0, 4));
        setError(null);

        // Prefetch first episode sources so Play is one tap.
        const firstEp =
          firstSeason == null
            ? null
            : meta.episodes.find((e) => e.season === firstSeason) ?? null;
        if (firstEp) {
          setSelectedEp(firstEp);
          setLoadingStreams(true);
          setSideTab("sources");
          const progressId = seriesProgressId(imdbId, firstEp.season, firstEp.episode);
          setSaved(getContinueWatch(progressId));
          try {
            void apiClient
              .warmCatalogSeries(imdbId, firstEp.season, firstEp.episode)
              .catch(() => undefined);
            const res = await apiClient.listCatalogSeriesStreams(
              imdbId,
              firstEp.season,
              firstEp.episode
            );
            if (!cancelled) setStreams(res.streams);
          } catch (err) {
            if (!cancelled) {
              setStreamError(isApiClientError(err) ? err.message : "Failed to list streams");
            }
          } finally {
            if (!cancelled) setLoadingStreams(false);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(isApiClientError(err) ? err.message : "Failed to load series");
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [imdbId]);

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (ev.origin !== window.location.origin) return;
      const data = ev.data as { type?: string; sessionId?: string; active?: boolean } | null;
      if (data?.type === "frankenstein:cinema-mode") {
        setCinemaMode(Boolean(data.active));
        return;
      }
      if (data?.type === "frankenstein:watch-stopped" && data.sessionId === sessionId) {
        setIframeSrc(null);
        setIframeReady(false);
        setSessionId(null);
        setCinemaMode(false);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [sessionId]);

  useEffect(() => {
    return () => {
      if (sessionId) void apiClient.stopPlayback(sessionId).catch(() => undefined);
    };
  }, [sessionId]);

  const episodes = useMemo(() => {
    if (!series || season === null) return [];
    return series.episodes.filter((e) => e.season === season);
  }, [series, season]);

  async function openEpisode(ep: {
    season: number;
    episode: number;
    name: string;
  }): Promise<CatalogStreamOption[]> {
    setSelectedEp(ep);
    setStreams([]);
    setStreamError(null);
    setLoadingStreams(true);
    setSideTab("sources");
    const progressId = seriesProgressId(imdbId, ep.season, ep.episode);
    setSaved(getContinueWatch(progressId));
    setResumeFromSaved(true);
    try {
      void apiClient.warmCatalogSeries(imdbId, ep.season, ep.episode).catch(() => undefined);
      // Prefetch the following episode while this one's sources load.
      if (series) {
        const ordered = [...series.episodes].sort((a, b) =>
          a.season !== b.season ? a.season - b.season : a.episode - b.episode
        );
        const idx = ordered.findIndex(
          (e) => e.season === ep.season && e.episode === ep.episode
        );
        const next = idx >= 0 ? ordered[idx + 1] : null;
        if (next) {
          void apiClient
            .warmCatalogSeries(imdbId, next.season, next.episode)
            .catch(() => undefined);
        }
      }
      const res = await apiClient.listCatalogSeriesStreams(imdbId, ep.season, ep.episode);
      setStreams(res.streams);
      return res.streams;
    } catch (err) {
      setStreamError(isApiClientError(err) ? err.message : "Failed to list streams");
      return [];
    } finally {
      setLoadingStreams(false);
    }
  }

  const visibleStreams = useMemo(
    () => streams.filter((s) => streamMatchesAudioPref(s.language, audioLang)),
    [streams, audioLang]
  );

  const primaryEpisode = selectedEp ?? episodes[0] ?? null;

  function episodeLabel(ep: { season: number; episode: number }) {
    return `S${String(ep.season).padStart(2, "0")}E${String(ep.episode).padStart(2, "0")}`;
  }

  function findNextEpisode(ep: { season: number; episode: number }) {
    if (!series) return null;
    const ordered = [...series.episodes].sort((a, b) =>
      a.season !== b.season ? a.season - b.season : a.episode - b.episode
    );
    const idx = ordered.findIndex(
      (e) => e.season === ep.season && e.episode === ep.episode
    );
    if (idx < 0 || idx >= ordered.length - 1) return null;
    return ordered[idx + 1] ?? null;
  }

  /** Warm RealDebrid + optional HLS remux for the following episode. */
  function preloadNextEpisode(ep: { season: number; episode: number }) {
    if (!series) return;
    const next = findNextEpisode(ep);
    if (!next) return;
    void apiClient
      .warmCatalogSeries(series.id, next.season, next.episode)
      .catch(() => undefined);
  }

  /** Load episode sources if needed, then play the best matching stream. */
  async function playBest() {
    if (!series) return;
    const ep = primaryEpisode;
    if (!ep) {
      setSideTab("episodes");
      return;
    }

    let list = streams;
    const alreadySelected =
      selectedEp?.season === ep.season && selectedEp?.episode === ep.episode;
    if (!alreadySelected || list.length === 0) {
      list = await openEpisode(ep);
    } else {
      setSideTab("sources");
    }

    const match =
      list.find((s) => streamMatchesAudioPref(s.language, audioLang)) ?? list[0];
    if (!match) {
      setStreamError("No playable sources for this episode yet.");
      setSideTab("sources");
      return;
    }
    await play(match.index);
  }

  async function play(streamIndex: number) {
    if (!series || !selectedEp) return;
    setBusyIndex(streamIndex);
    setPrepareMsg("Starting session…");
    setIframeReady(false);
    setPreferredAudioLang(audioLang);
    setPreferredSubtitleLang(subLang);
    try {
      if (sessionId) {
        void apiClient.stopPlayback(sessionId).catch(() => undefined);
      }
      const pick = streams.find((s) => s.index === streamIndex);
      setPrepareMsg(
        pick?.locallyCached
          ? "Loading from server cache…"
          : "Caching / remuxing for playback — this can take a minute on first play…"
      );
      const session = await apiClient.startCatalogSeriesPlayback(
        series.id,
        selectedEp.season,
        selectedEp.episode,
        streamIndex,
        audioLang
      );
      let ready = session.status === "ready" && Boolean(session.playlistUrl);
      const deadline = Date.now() + 180_000;
      while (!ready && Date.now() < deadline) {
        setPrepareMsg(`Preparing stream… (${session.status})`);
        await new Promise((r) => setTimeout(r, 800));
        const s = await apiClient.getPlayback(session.sessionId);
        if (s.status === "failed") {
          throw new Error(s.errorMessage || "Playback session failed");
        }
        ready = s.status === "ready" && Boolean(s.playlistUrl);
      }
      if (!ready) throw new Error("Timed out waiting for stream to become ready");

      setSessionId(session.sessionId);
      const label = `${series.name} S${String(selectedEp.season).padStart(2, "0")}E${String(selectedEp.episode).padStart(2, "0")}`;
      const progressId = seriesProgressId(series.id, selectedEp.season, selectedEp.episode);
      const from = `/series/${series.id}`;
      const t =
        resumeFromSaved && saved && saved.position > 15 ? Math.floor(saved.position) : 0;
      const next = findNextEpisode(selectedEp);
      preloadNextEpisode(selectedEp);
      const qs = new URLSearchParams({
        embed: "1",
        title: label,
        from,
        progress: progressId,
        type: "series",
        imdb: series.id,
        season: String(selectedEp.season),
        episode: String(selectedEp.episode),
        sub: subLang,
      });
      if (t > 0) qs.set("t", String(t));
      if (next) {
        qs.set("nextSeason", String(next.season));
        qs.set("nextEpisode", String(next.episode));
      }
      setIframeSrc(`/watch/${encodeURIComponent(session.sessionId)}?${qs.toString()}`);
      setPrepareMsg(null);
    } catch (err) {
      setStreamError(
        isApiClientError(err) ? err.message : err instanceof Error ? err.message : "Could not start playback"
      );
      setPrepareMsg(null);
      setIframeSrc(null);
    } finally {
      setBusyIndex(null);
    }
  }

  const showPlayer = Boolean(iframeSrc);
  const showLoader = busyIndex !== null || (showPlayer && !iframeReady);

  return (
    <SiteShell flush pulseFooter searchHref="/series" searchPlaceholder="Search TV series">
      {prepareMsg ? (
        <div className="prepare-overlay" role="status" aria-live="polite">
          <div className="prepare-card">
            <span className="spinner" aria-hidden />
            <h2>Preparing episode</h2>
            <p>{prepareMsg}</p>
            <p className="muted">Stay on this screen — the cinema player opens when ready.</p>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="pulse-content">
          <StateBlock tone="error" title="Series unavailable" message={error} />
        </div>
      ) : null}
      {!error && !series ? (
        <div className="pulse-content">
          <StateBlock title="Loading…" message="Fetching seasons and episodes." />
        </div>
      ) : null}

      {series ? (
        <div className="pulse-content pulse-cinema-detail">
          <CatalogModeBar active="series" />

          <div className="pulse-cinema-stage">
            <section
              className={`pulse-cinema-player${cinemaMode ? " is-cinema-mode" : ""}`}
              aria-label={`${series.name} player`}
            >
              <div className="sport-embed-frame pulse-cinema-frame">
                {showLoader ? (
                  <div className="sport-embed-loader" role="status" aria-live="polite">
                    <span className="sport-embed-spinner" aria-hidden />
                    <p>{busyIndex !== null ? "Starting playback…" : "Loading player…"}</p>
                  </div>
                ) : null}
                {iframeSrc ? (
                  <iframe
                    key={iframeSrc}
                    src={iframeSrc}
                    title={series.name}
                    allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                    allowFullScreen
                    onLoad={() => setIframeReady(true)}
                  />
                ) : (
                  <div
                    className="pulse-cinema-poster-stage"
                    style={
                      series.poster
                        ? {
                            backgroundImage: `linear-gradient(180deg, transparent 40%, #0c0c0e), url(${series.poster})`,
                          }
                        : undefined
                    }
                  >
                    <div className="pulse-cinema-poster-copy">
                      <span className="pulse-badge pulse-badge--ghost">
                        Universal Player — Series Experience
                      </span>
                      <h2>{series.name}</h2>
                      <p className="muted">
                        {selectedEp
                          ? `${episodeLabel(selectedEp)} · ${selectedEp.name}`
                          : primaryEpisode
                            ? `${episodeLabel(primaryEpisode)} · ${primaryEpisode.name}`
                            : "Choose an episode from the sidebar, then press Play."}
                      </p>
                      <button
                        type="button"
                        className="accent-btn pulse-cta"
                        disabled={!primaryEpisode || busyIndex !== null || loadingStreams}
                        onClick={() => void playBest()}
                      >
                        {busyIndex !== null
                          ? "Starting…"
                          : primaryEpisode
                            ? `▶ Play ${episodeLabel(primaryEpisode)}`
                            : "▶ Play Episode"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className="pulse-cinema-techbar">
                <span>
                  <span className="pulse-ok-dot" />
                  {showPlayer ? "STREAM VERIFIED" : "SERIES CATALOG"}
                </span>
                <span>
                  {series.seasons.length} season{series.seasons.length === 1 ? "" : "s"} ·{" "}
                  {series.episodes.length} episodes
                </span>
                <span>{techBadgesFor(series).join(" · ")}</span>
              </div>
            </section>

            <aside className="pulse-cinema-sidebar" aria-label="Series panel">
              <div className="pulse-filter-bar pulse-tabs" role="tablist">
                {(
                  [
                    ["episodes", "Episodes"],
                    ["sources", "Sources"],
                    ["stats", "Stats"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={sideTab === id}
                    className={`pulse-chip pulse-chip--sm${sideTab === id ? " is-active" : ""}`}
                    onClick={() => setSideTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {sideTab === "episodes" ? (
                <div className="pulse-cinema-side-body">
                  <label className="pulse-season-select">
                    Season
                    <select
                      value={season ?? ""}
                      onChange={(e) => {
                        setSeason(Number(e.target.value));
                        setSelectedEp(null);
                        setStreams([]);
                      }}
                    >
                      {series.seasons.map((s) => (
                        <option key={s} value={s}>
                          Season {s}
                        </option>
                      ))}
                    </select>
                  </label>
                  <ul className="pulse-episode-list">
                    {episodes.map((ep) => {
                      const active =
                        selectedEp?.season === ep.season && selectedEp?.episode === ep.episode;
                      return (
                        <li key={`${ep.season}-${ep.episode}`}>
                          <button
                            type="button"
                            className={`pulse-episode-btn${active ? " is-active" : ""}`}
                            onClick={() => void openEpisode(ep)}
                          >
                            <strong>
                              E{String(ep.episode).padStart(2, "0")}
                            </strong>
                            <span>{ep.name}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}

              {sideTab === "sources" ? (
                <div className="pulse-cinema-side-body">
                  {!selectedEp ? (
                    <StateBlock
                      title="Pick an episode"
                      message="Open the Episodes tab and select one to load streams."
                    />
                  ) : (
                    <>
                      <p className="muted">
                        S{String(selectedEp.season).padStart(2, "0")}E
                        {String(selectedEp.episode).padStart(2, "0")} · {selectedEp.name}
                      </p>
                      <div className="lang-prefs pulse-cinema-langs">
                        <label>
                          Audio
                          <select
                            value={audioLang}
                            onChange={(e) => {
                              setAudioLang(e.target.value);
                              setPreferredAudioLang(e.target.value);
                            }}
                          >
                            {AUDIO_PRESETS.map((l) => (
                              <option key={l} value={l}>
                                {l === "any" ? "Any" : l}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Subs
                          <select
                            value={subLang}
                            onChange={(e) => {
                              setSubLang(e.target.value);
                              setPreferredSubtitleLang(e.target.value);
                            }}
                          >
                            <option value="off">Off</option>
                            <option value="eng">English</option>
                            <option value="spa">Spanish</option>
                            <option value="fre">French</option>
                            <option value="ger">German</option>
                            <option value="ita">Italian</option>
                            <option value="por">Portuguese</option>
                          </select>
                        </label>
                      </div>
                      {saved && saved.position > 15 ? (
                        <div className="pulse-cinema-resume">
                          <p>Continue from {formatResumeLabel(saved.position)}</p>
                          <div className="hero-actions">
                            <button
                              type="button"
                              className={resumeFromSaved ? "accent-btn" : "ghost-btn"}
                              onClick={() => setResumeFromSaved(true)}
                            >
                              Resume
                            </button>
                            <button
                              type="button"
                              className={!resumeFromSaved ? "accent-btn" : "ghost-btn"}
                              onClick={() => {
                                setResumeFromSaved(false);
                                clearContinueWatch(
                                  seriesProgressId(imdbId, selectedEp.season, selectedEp.episode)
                                );
                                setSaved(null);
                              }}
                            >
                              Start over
                            </button>
                          </div>
                        </div>
                      ) : null}
                      {loadingStreams ? <p className="muted">Loading streams…</p> : null}
                      {streamError ? (
                        <StateBlock tone="error" title="Streams unavailable" message={streamError} />
                      ) : null}
                      {!loadingStreams && streams.length === 0 && !streamError ? (
                        <StateBlock title="No streams" message="Torrentio returned no sources." />
                      ) : null}
                      {visibleStreams.length > 0 ? (
                        <ul className="pulse-source-list">
                          {visibleStreams.map((s) => (
                            <li key={s.index}>
                              <div>
                                {s.locallyCached ? (
                                  <strong className="stream-ready">Ready </strong>
                                ) : null}
                                {s.cached && !s.locallyCached ? (
                                  <strong className="stream-cached">Cached </strong>
                                ) : null}
                                <span>{s.label}</span>
                              </div>
                              <button
                                type="button"
                                className="accent-btn"
                                disabled={busyIndex !== null}
                                onClick={() => void play(s.index)}
                              >
                                {busyIndex === s.index
                                  ? "…"
                                  : s.locallyCached
                                    ? "Play"
                                    : s.cached
                                      ? "Watch"
                                      : "Get"}
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </>
                  )}
                </div>
              ) : null}

              {sideTab === "stats" ? (
                <div className="pulse-cinema-side-body">
                  <h3>Series stats</h3>
                  <ul className="pulse-stat-list">
                    <li>
                      <span>Seasons</span>
                      <strong>{series.seasons.length}</strong>
                    </li>
                    <li>
                      <span>Episodes</span>
                      <strong>{series.episodes.length}</strong>
                    </li>
                    <li>
                      <span>Sources (selected)</span>
                      <strong>{streams.length}</strong>
                    </li>
                    <li>
                      <span>Session</span>
                      <strong>{sessionId ? "Active" : "Idle"}</strong>
                    </li>
                  </ul>
                </div>
              ) : null}
            </aside>
          </div>

          <section className="pulse-cinema-meta-block">
            <h1>{series.name}</h1>
            <div className="pulse-cinema-meta">
              <span className="pulse-badge">Series</span>
              {series.year ? (
                <span className="pulse-badge pulse-badge--ghost">{series.year}</span>
              ) : null}
              {techBadgesFor(series).map((b) => (
                <span key={b} className="pulse-badge pulse-badge--ghost">
                  {b}
                </span>
              ))}
            </div>
            <p className="pulse-cinema-credits">
              ★ {titleRating(series)} IMDb · {titleGenre(series)} · {series.episodes.length} episodes
            </p>
            <p className="pulse-hero-desc">
              Series catalog title with season episode streams via Torrentio + RealDebrid when
              configured. Select an episode, then a source, to remux into the cinema player.
            </p>
            <div className="pulse-hero-actions">
              <button
                type="button"
                className="accent-btn pulse-cta"
                disabled={!primaryEpisode || busyIndex !== null || loadingStreams}
                onClick={() => void playBest()}
              >
                {busyIndex !== null
                  ? "Starting…"
                  : primaryEpisode
                    ? `▶ Play ${episodeLabel(primaryEpisode)}`
                    : "▶ Play Episode"}
              </button>
              <button type="button" className="ghost-btn pulse-cta-ghost">
                + Add to My List
              </button>
              {primaryEpisode ? (
                <button
                  type="button"
                  className="ghost-btn pulse-cta-ghost"
                  onClick={() => void openEpisode(primaryEpisode)}
                >
                  Open {episodeLabel(primaryEpisode)} Sources
                </button>
              ) : null}
            </div>
          </section>

          {related.length > 0 ? (
            <section className="pulse-section">
              <div className="pulse-section-head">
                <h2>Related Series</h2>
                <Link href="/series" className="pulse-link">
                  Browse all
                </Link>
              </div>
              <div className="pulse-related-row">
                {related.map((item) => (
                  <Link
                    key={item.id}
                    href={`/series/${encodeURIComponent(item.id)}`}
                    className="pulse-related-card"
                  >
                    <div className="pulse-related-thumb">
                      {item.poster ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.poster} alt="" />
                      ) : (
                        <div className="pulse-poster-fallback" />
                      )}
                      <span className="pulse-badge pulse-badge--ghost">
                        {techBadgesFor(item)[0]}
                      </span>
                    </div>
                    <strong>{item.name}</strong>
                    <span className="muted">
                      ★ {titleRating(item)}
                      {item.year ? ` · ${item.year}` : ""}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
    </SiteShell>
  );
}
