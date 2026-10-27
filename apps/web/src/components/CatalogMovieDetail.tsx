"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { CatalogStreamOption, CatalogTitle } from "@frankenstein/shared-types";
import { SiteShell } from "./SiteShell";
import { StateBlock } from "./StateBlock";
import { CatalogModeBar } from "./CatalogModeBar";
import { apiClient } from "@/lib/api-client";
import { isApiClientError } from "@/lib/api-error";
import {
  clearContinueWatch,
  formatResumeLabel,
  getContinueWatch,
  movieProgressId,
  type ContinueWatchEntry,
} from "@/lib/continue-watching";
import {
  getPreferredAudioLang,
  getPreferredSubtitleLang,
  setPreferredAudioLang,
  setPreferredSubtitleLang,
  streamMatchesAudioPref,
} from "@/lib/playback-prefs";
import {
  relatedBlurb,
  techBadgesFor,
  titleGenre,
  titleRating,
  titleXray,
} from "@/lib/catalog-ui";

type Props = { imdbId: string };

const AUDIO_PRESETS = ["any", "ENG", "SPA", "FRE", "GER", "ITA", "POR", "RUS", "JPN", "Multi"];

export function CatalogMovieDetail({ imdbId }: Props) {
  const [movie, setMovie] = useState<CatalogTitle | null>(null);
  const [related, setRelated] = useState<CatalogTitle[]>([]);
  const [streams, setStreams] = useState<CatalogStreamOption[]>([]);
  const [edgeReadyCount, setEdgeReadyCount] = useState(0);
  const [edgeEnabled, setEdgeEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  const [prepareMsg, setPrepareMsg] = useState<string | null>(null);
  const [playError, setPlayError] = useState<string | null>(null);
  const [saved, setSaved] = useState<ContinueWatchEntry | null>(null);
  const [resumeFromSaved, setResumeFromSaved] = useState(true);
  const [audioLang, setAudioLang] = useState("ENG");
  const [subLang, setSubLang] = useState("eng");
  const [iframeSrc, setIframeSrc] = useState<string | null>(null);
  const [iframeReady, setIframeReady] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sideTab, setSideTab] = useState<"xray" | "sources" | "stats">("xray");
  const [listAdded, setListAdded] = useState(false);
  const [cinemaMode, setCinemaMode] = useState(false);

  const progressId = movieProgressId(imdbId);
  const xray = useMemo(() => (movie ? titleXray(movie) : null), [movie]);

  useEffect(() => {
    setSaved(getContinueWatch(progressId));
    setResumeFromSaved(true);
    setAudioLang(getPreferredAudioLang());
    setSubLang(getPreferredSubtitleLang());
    setListAdded(false);
  }, [progressId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        void apiClient.warmCatalogMovie(imdbId).catch(() => undefined);
        const [meta, streamRes, list] = await Promise.all([
          apiClient.getCatalogMovie(imdbId),
          apiClient.listCatalogMovieStreams(imdbId),
          apiClient.listCatalogMovies().catch(() => null),
        ]);
        if (!cancelled) {
          setMovie(meta);
          setStreams(streamRes.streams);
          setEdgeReadyCount(streamRes.edge?.readyCount ?? 0);
          setEdgeEnabled(Boolean(streamRes.edge?.streamCacheEnabled));
          setRelated((list?.items ?? []).filter((x) => x.id !== meta.id).slice(0, 4));
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(isApiClientError(err) ? err.message : "Failed to load movie");
        }
      }
    }
    void load();

    const poll = window.setInterval(() => {
      void apiClient
        .listCatalogMovieStreams(imdbId)
        .then((streamRes) => {
          if (cancelled) return;
          setStreams(streamRes.streams);
          setEdgeReadyCount(streamRes.edge?.readyCount ?? 0);
          setEdgeEnabled(Boolean(streamRes.edge?.streamCacheEnabled));
        })
        .catch(() => undefined);
    }, 8_000);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
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

  const visibleStreams = useMemo(
    () => streams.filter((s) => streamMatchesAudioPref(s.language, audioLang)),
    [streams, audioLang]
  );

  async function play(streamIndex: number) {
    if (!movie) return;
    setBusyIndex(streamIndex);
    setPlayError(null);
    setPrepareMsg("Starting session…");
    setIframeReady(false);
    setSideTab("sources");
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
      const session = await apiClient.startCatalogMoviePlayback(
        movie.id,
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
        if (ready) break;
      }
      if (!ready) throw new Error("Timed out waiting for stream to become ready");

      setSessionId(session.sessionId);
      const from = `/movies/catalog/${movie.id}`;
      const t =
        resumeFromSaved && saved && saved.position > 15 ? Math.floor(saved.position) : 0;
      const qs = new URLSearchParams({
        embed: "1",
        title: movie.name,
        from,
        progress: progressId,
        type: "movie",
        imdb: movie.id,
        sub: subLang,
      });
      if (t > 0) qs.set("t", String(t));
      setIframeSrc(`/watch/${encodeURIComponent(session.sessionId)}?${qs.toString()}`);
      setPrepareMsg(null);
    } catch (err) {
      setPlayError(
        isApiClientError(err)
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not start playback"
      );
      setPrepareMsg(null);
      setIframeSrc(null);
    } finally {
      setBusyIndex(null);
    }
  }

  const showPlayer = Boolean(iframeSrc);
  const showLoader = busyIndex !== null || (showPlayer && !iframeReady);
  const badges = movie ? techBadgesFor(movie) : [];

  return (
    <SiteShell flush pulseFooter searchHref="/movies" searchPlaceholder="Search movies">
      {prepareMsg ? (
        <div className="prepare-overlay" role="status" aria-live="polite">
          <div className="prepare-card">
            <span className="spinner" aria-hidden />
            <h2>Preparing movie</h2>
            <p>{prepareMsg}</p>
            <p className="muted">Stay on this screen — the cinema player opens when ready.</p>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="pulse-content">
          <StateBlock tone="error" title="Movie unavailable" message={error} />
        </div>
      ) : null}
      {!error && !movie ? (
        <div className="pulse-content">
          <StateBlock title="Loading…" message="Fetching catalog metadata and streams." />
        </div>
      ) : null}

      {movie && xray ? (
        <div className="pulse-content pulse-cinema-detail">
          <CatalogModeBar active="movie" bitrateMbps={xray.bitrateMbps} />

          <div className="pulse-cinema-stage">
            <section
              className={`pulse-cinema-player${cinemaMode ? " is-cinema-mode" : ""}`}
              aria-label={`${movie.name} player`}
            >
              <div className="sport-embed-frame pulse-cinema-frame">
                <div className="pulse-player-chrome pulse-player-chrome--top">
                  <span>Universal Player — Desktop Cinema Experience</span>
                  <span className="pulse-player-res">4K UHD 60 FPS</span>
                </div>
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
                    title={movie.name}
                    allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                    allowFullScreen
                    onLoad={() => setIframeReady(true)}
                  />
                ) : (
                  <div
                    className="pulse-cinema-poster-stage"
                    style={
                      movie.poster
                        ? {
                            backgroundImage: `linear-gradient(180deg, rgba(12,12,14,0.15) 20%, rgba(12,12,14,0.92)), url(${movie.poster})`,
                          }
                        : undefined
                    }
                  >
                    <div className="pulse-cinema-poster-copy">
                      <h2>{movie.name}</h2>
                      <p className="muted">Open Sources in the sidebar to begin remux playback.</p>
                      <button
                        type="button"
                        className="accent-btn pulse-cta"
                        disabled={!visibleStreams[0] || busyIndex !== null}
                        onClick={() => {
                          setSideTab("sources");
                          if (visibleStreams[0]) void play(visibleStreams[0].index);
                        }}
                      >
                        ▶ Watch Now
                      </button>
                    </div>
                  </div>
                )}
                <div className="pulse-player-chrome pulse-player-chrome--bottom">
                  <span className="pulse-player-verified">
                    <span className="pulse-ok-dot" />
                    {showPlayer ? "STREAM VERIFIED 2160p HEVC" : "PIPELINE ARMED · SELECT SOURCE"}
                  </span>
                  <span>Bitrate: {xray.bitrateMbps} Mbps</span>
                  <span>Audio: {audioLang === "any" ? "Multi" : audioLang}</span>
                </div>
              </div>
            </section>

            <aside className="pulse-cinema-sidebar pulse-xray-panel" aria-label="X-Ray panel">
              <div className="pulse-xray-tabs" role="tablist">
                {(
                  [
                    ["xray", "X-Ray"],
                    ["sources", "Sources"],
                    ["stats", "Stats"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={sideTab === id}
                    className={`pulse-xray-tab${sideTab === id ? " is-active" : ""}`}
                    onClick={() => setSideTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {sideTab === "xray" ? (
                <div className="pulse-cinema-side-body pulse-xray-body">
                  <div className="pulse-xray-block">
                    <h3>In This Scene</h3>
                    <ul className="pulse-cast-list">
                      {xray.cast.map((person) => (
                        <li key={person.name}>
                          <span className="pulse-cast-avatar" aria-hidden>
                            {person.initial}
                          </span>
                          <div>
                            <strong>{person.name}</strong>
                            <span>{person.role}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="pulse-xray-block">
                    <h3>Soundtrack Playing</h3>
                    <div className="pulse-soundtrack">
                      <span className="pulse-soundtrack-icon" aria-hidden>
                        ♪
                      </span>
                      <div>
                        <strong>{xray.soundtrack.title}</strong>
                        <span>{xray.soundtrack.artist}</span>
                      </div>
                    </div>
                  </div>
                  <div className="pulse-xray-block">
                    <h3>Scene Trivia</h3>
                    <p>{xray.trivia}</p>
                  </div>
                  <div className="pulse-xray-block">
                    <h3>Filming Location</h3>
                    <p className="pulse-xray-location">
                      <span aria-hidden>📍</span> {xray.location}
                    </p>
                  </div>
                </div>
              ) : null}

              {sideTab === "sources" ? (
                <div className="pulse-cinema-side-body">
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
                  {edgeEnabled ? (
                    <p className="muted pulse-cinema-edge">
                      {edgeReadyCount > 0
                        ? `Edge ready · ${edgeReadyCount} source${edgeReadyCount === 1 ? "" : "s"}`
                        : "Warming edge cache…"}
                    </p>
                  ) : null}
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
                            clearContinueWatch(progressId);
                            setSaved(null);
                          }}
                        >
                          Start over
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {visibleStreams.length === 0 ? (
                    <StateBlock
                      tone="warn"
                      title="No streams"
                      message="Try Audio → Any, or wait for Torrentio sources."
                    />
                  ) : (
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
                  )}
                </div>
              ) : null}

              {sideTab === "stats" ? (
                <div className="pulse-cinema-side-body">
                  <ul className="pulse-stat-list">
                    <li>
                      <span>Resolution target</span>
                      <strong>2160p HEVC</strong>
                    </li>
                    <li>
                      <span>Pipeline bitrate</span>
                      <strong>{xray.bitrateMbps} Mbps</strong>
                    </li>
                    <li>
                      <span>Sources</span>
                      <strong>{streams.length}</strong>
                    </li>
                    <li>
                      <span>Visible (audio)</span>
                      <strong>{visibleStreams.length}</strong>
                    </li>
                    <li>
                      <span>Edge ready</span>
                      <strong>{edgeReadyCount}</strong>
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

          {playError ? (
            <StateBlock tone="error" title="Playback failed" message={playError} />
          ) : null}

          <section className="pulse-cinema-meta-block">
            <div className="pulse-tag-row">
              <span className="pulse-tag pulse-tag--accent">PREMIERE 4K</span>
              {movie.year ? <span className="pulse-tag">{movie.year}</span> : null}
              <span className="pulse-tag">{xray.ratingLabel}</span>
              <span className="pulse-tag">{xray.runtime}</span>
              <span className="pulse-tag pulse-tag--green">DOLBY ATMOS</span>
              {badges.includes("IMAX ENHANCED") ? (
                <span className="pulse-tag pulse-tag--gold">IMAX ENHANCED</span>
              ) : (
                <span className="pulse-tag pulse-tag--gold">HDR10+</span>
              )}
            </div>
            <h1>{movie.name}</h1>
            <p className="pulse-cinema-credits">
              <span className="pulse-imdb">★ {titleRating(movie)} / 10 IMDb</span>
              <span>Genre {titleGenre(movie)}</span>
              <span>Catalog {movie.id}</span>
            </p>
            <p className="pulse-hero-desc">
              Feature title from your configured Cinemeta catalog. Select a torrent source in the
              sidebar to remux and watch in the desktop cinema player with low-latency HLS.
            </p>
            <div className="pulse-hero-actions pulse-meta-actions">
              <Link href="/list" className="accent-btn pulse-cta" onClick={() => setListAdded(true)}>
                {listAdded ? "✓ On My List" : "+ Add to My List"}
              </Link>
              <button
                type="button"
                className="ghost-btn pulse-cta-ghost"
                disabled={!visibleStreams[0] || busyIndex !== null}
                onClick={() => visibleStreams[0] && void play(visibleStreams[0].index)}
              >
                Download 4K / Play Best
              </button>
              <button type="button" className="ghost-btn pulse-icon-btn" aria-label="Rate" title="Rate">
                ★
              </button>
              <button
                type="button"
                className="ghost-btn pulse-icon-btn"
                aria-label="Share"
                title="Share"
                onClick={() => {
                  void navigator.clipboard?.writeText(window.location.href);
                }}
              >
                ↗
              </button>
            </div>
          </section>

          {related.length > 0 ? (
            <section className="pulse-section">
              <div className="pulse-section-head">
                <h2>Related in Universe &amp; {titleGenre(movie)} Narratives</h2>
                <Link href="/movies" className="pulse-link">
                  Browse all →
                </Link>
              </div>
              <div className="pulse-related-row">
                {related.map((item) => (
                  <Link
                    key={item.id}
                    href={`/movies/catalog/${encodeURIComponent(item.id)}`}
                    className="pulse-related-card pulse-related-card--rich"
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
                    <div className="pulse-related-copy">
                      <strong>{item.name}</strong>
                      <span className="pulse-related-rating">
                        ★ {titleRating(item)} IMDb
                        {item.year ? ` · ${item.year}` : ""}
                      </span>
                      <p>{relatedBlurb(item)}</p>
                      <span className="muted">{titleGenre(item)}</span>
                    </div>
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
