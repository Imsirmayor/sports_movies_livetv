"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CatalogStreamOption, CatalogTitle } from "@frankenstein/shared-types";
import { SiteShell } from "./SiteShell";
import { StateBlock } from "./StateBlock";
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

type Props = { imdbId: string };

const AUDIO_PRESETS = ["any", "ENG", "SPA", "FRE", "GER", "ITA", "POR", "RUS", "JPN", "Multi"];

export function CatalogMovieDetail({ imdbId }: Props) {
  const router = useRouter();
  const [movie, setMovie] = useState<CatalogTitle | null>(null);
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

  const progressId = movieProgressId(imdbId);

  useEffect(() => {
    setSaved(getContinueWatch(progressId));
    setResumeFromSaved(true);
    setAudioLang(getPreferredAudioLang());
    setSubLang(getPreferredSubtitleLang());
  }, [progressId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        void apiClient.warmCatalogMovie(imdbId).catch(() => undefined);
        const [meta, streamRes] = await Promise.all([
          apiClient.getCatalogMovie(imdbId),
          apiClient.listCatalogMovieStreams(imdbId),
        ]);
        if (!cancelled) {
          setMovie(meta);
          setStreams(streamRes.streams);
          setEdgeReadyCount(streamRes.edge?.readyCount ?? 0);
          setEdgeEnabled(Boolean(streamRes.edge?.streamCacheEnabled));
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

  const visibleStreams = useMemo(
    () => streams.filter((s) => streamMatchesAudioPref(s.language, audioLang)),
    [streams, audioLang]
  );

  async function play(streamIndex: number) {
    if (!movie) return;
    setBusyIndex(streamIndex);
    setPlayError(null);
    setPrepareMsg("Starting session…");
    setPreferredAudioLang(audioLang);
    setPreferredSubtitleLang(subLang);
    try {
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

      // Stay on the movie page with a spinner until the playlist is ready.
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
      if (!ready) {
        throw new Error("Timed out waiting for stream to become ready");
      }

      const from = `/movies/catalog/${movie.id}`;
      const t =
        resumeFromSaved && saved && saved.position > 15 ? Math.floor(saved.position) : 0;
      const qs = new URLSearchParams({
        title: movie.name,
        from,
        progress: progressId,
        type: "movie",
        imdb: movie.id,
        sub: subLang,
      });
      if (t > 0) qs.set("t", String(t));
      router.push(`/watch/${session.sessionId}?${qs.toString()}`);
    } catch (err) {
      setPlayError(isApiClientError(err) ? err.message : err instanceof Error ? err.message : "Could not start playback");
      setPrepareMsg(null);
    } finally {
      setBusyIndex(null);
    }
  }

  return (
    <SiteShell searchHref="/movies">
      {prepareMsg ? (
        <div className="prepare-overlay" role="status" aria-live="polite">
          <div className="prepare-card">
            <span className="spinner" aria-hidden />
            <h2>Preparing movie</h2>
            <p>{prepareMsg}</p>
            <p className="muted">Stay on this screen — playback opens when the cache is ready.</p>
          </div>
        </div>
      ) : null}

      {error ? <StateBlock tone="error" title="Movie unavailable" message={error} /> : null}
      {!error && !movie ? <StateBlock title="Loading…" message="Fetching catalog metadata and streams." /> : null}
      {movie ? (
        <article className="detail-panel">
          <p className="eyebrow">Torrentio catalog · {movie.id}</p>
          <div className="catalog-detail-row">
            {movie.poster ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="catalog-poster" src={movie.poster} alt="" />
            ) : null}
            <div>
              <h1>
                {movie.name}
                {movie.year ? ` (${movie.year})` : ""}
              </h1>
              <p className="muted">
                Pick audio language to filter sources. Subtitles load in the player after Watch.
              </p>
            </div>
          </div>

          <div className="lang-prefs">
            <label>
              Audio language
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
              Subtitles
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
                <option value="rus">Russian</option>
                <option value="jpn">Japanese</option>
              </select>
            </label>
          </div>

          {edgeEnabled ? (
            <StateBlock
              tone={edgeReadyCount > 0 ? undefined : "warn"}
              title={
                edgeReadyCount > 0
                  ? `Edge ready · ${edgeReadyCount} source${edgeReadyCount === 1 ? "" : "s"}`
                  : "Warming edge cache…"
              }
              message={
                edgeReadyCount > 0
                  ? "Pick a “Ready on server” source for instant start. Others may still need a first-time remux."
                  : "RealDebrid + local remux are warming. You can watch now, or wait for Ready badges."
              }
            />
          ) : null}

          {playError ? (
            <StateBlock tone="error" title="Playback failed" message={playError} />
          ) : null}
          {saved && saved.position > 15 ? (
            <StateBlock
              tone="warn"
              title={`Continue from ${formatResumeLabel(saved.position)}`}
              message="Saved in this browser only — no account needed. Pick a stream below to resume, or start over."
              action={
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
              }
            />
          ) : null}

          {visibleStreams.length === 0 ? (
            <StateBlock
              tone="warn"
              title="No streams for this audio language"
              message="Try Audio language → Any, or another language."
            />
          ) : (
            <ul className="stream-list">
              {visibleStreams.map((s) => (
                <li key={s.index}>
                  <span>
                    {s.locallyCached ? (
                      <strong className="stream-ready">Ready on server </strong>
                    ) : null}
                    {s.cached && !s.locallyCached ? (
                      <strong className="stream-cached">Cached </strong>
                    ) : null}
                    {s.label}
                  </span>
                  <button
                    type="button"
                    className="accent-btn"
                    disabled={busyIndex !== null}
                    onClick={() => void play(s.index)}
                  >
                    {busyIndex === s.index
                      ? "Preparing…"
                      : s.locallyCached
                        ? "Play now"
                        : s.cached
                          ? "Watch"
                          : "Download & watch"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </article>
      ) : null}
    </SiteShell>
  );
}
