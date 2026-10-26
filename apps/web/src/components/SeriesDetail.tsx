"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CatalogStreamOption, SeriesMeta } from "@frankenstein/shared-types";
import { SiteShell } from "./SiteShell";
import { StateBlock } from "./StateBlock";
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

type Props = { imdbId: string };

const AUDIO_PRESETS = ["any", "ENG", "SPA", "FRE", "GER", "ITA", "POR", "RUS", "JPN", "Multi"];

export function SeriesDetail({ imdbId }: Props) {
  const router = useRouter();
  const [series, setSeries] = useState<SeriesMeta | null>(null);
  const [season, setSeason] = useState<number | null>(null);
  const [selectedEp, setSelectedEp] = useState<{ season: number; episode: number; name: string } | null>(
    null
  );
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

  useEffect(() => {
    setAudioLang(getPreferredAudioLang());
    setSubLang(getPreferredSubtitleLang());
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const meta = await apiClient.getCatalogSeries(imdbId);
        if (!cancelled) {
          setSeries(meta);
          setSeason(meta.seasons[0] ?? null);
          setError(null);
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

  const episodes = useMemo(() => {
    if (!series || season === null) return [];
    return series.episodes.filter((e) => e.season === season);
  }, [series, season]);

  async function openEpisode(ep: { season: number; episode: number; name: string }) {
    setSelectedEp(ep);
    setStreams([]);
    setStreamError(null);
    setLoadingStreams(true);
    const progressId = seriesProgressId(imdbId, ep.season, ep.episode);
    setSaved(getContinueWatch(progressId));
    setResumeFromSaved(true);
    try {
      void apiClient.warmCatalogSeries(imdbId, ep.season, ep.episode).catch(() => undefined);
      const res = await apiClient.listCatalogSeriesStreams(imdbId, ep.season, ep.episode);
      setStreams(res.streams);
    } catch (err) {
      setStreamError(isApiClientError(err) ? err.message : "Failed to list streams");
    } finally {
      setLoadingStreams(false);
    }
  }

  const visibleStreams = useMemo(
    () => streams.filter((s) => streamMatchesAudioPref(s.language, audioLang)),
    [streams, audioLang]
  );

  async function play(streamIndex: number) {
    if (!series || !selectedEp) return;
    setBusyIndex(streamIndex);
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

      const label = `${series.name} S${String(selectedEp.season).padStart(2, "0")}E${String(selectedEp.episode).padStart(2, "0")}`;
      const progressId = seriesProgressId(series.id, selectedEp.season, selectedEp.episode);
      const from = `/series/${series.id}`;
      const t =
        resumeFromSaved && saved && saved.position > 15 ? Math.floor(saved.position) : 0;
      const qs = new URLSearchParams({
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
      router.push(`/watch/${session.sessionId}?${qs.toString()}`);
    } catch (err) {
      setStreamError(
        isApiClientError(err) ? err.message : err instanceof Error ? err.message : "Could not start playback"
      );
      setPrepareMsg(null);
    } finally {
      setBusyIndex(null);
    }
  }

  return (
    <SiteShell searchHref="/series" searchPlaceholder="Search TV series">
      {prepareMsg ? (
        <div className="prepare-overlay" role="status" aria-live="polite">
          <div className="prepare-card">
            <span className="spinner" aria-hidden />
            <h2>Preparing episode</h2>
            <p>{prepareMsg}</p>
            <p className="muted">Stay on this screen — playback opens when the cache is ready.</p>
          </div>
        </div>
      ) : null}
      {error ? <StateBlock tone="error" title="Series unavailable" message={error} /> : null}
      {!error && !series ? <StateBlock title="Loading…" message="Fetching seasons and episodes." /> : null}

      {series ? (
        <article className="detail-panel">
          <p className="eyebrow">Series catalog · {series.id}</p>
          <div className="catalog-detail-row">
            {series.poster ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="catalog-poster" src={series.poster} alt="" />
            ) : null}
            <div>
              <h1>
                {series.name}
                {series.year ? ` (${series.year})` : ""}
              </h1>
              <p className="muted">
                {series.seasons.length} season{series.seasons.length === 1 ? "" : "s"} ·{" "}
                {series.episodes.length} episodes
              </p>
            </div>
          </div>

          <label className="filter-bar" style={{ display: "block", marginBottom: "1rem" }}>
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

          <ul className="stream-list">
            {episodes.map((ep) => (
              <li key={`${ep.season}-${ep.episode}`}>
                <span>
                  E{String(ep.episode).padStart(2, "0")} · {ep.name}
                </span>
                <button type="button" className="ghost-btn" onClick={() => void openEpisode(ep)}>
                  Streams
                </button>
              </li>
            ))}
          </ul>

          {selectedEp ? (
            <section className="content-section" style={{ marginTop: "1.5rem" }}>
              <h2>
                S{String(selectedEp.season).padStart(2, "0")}E
                {String(selectedEp.episode).padStart(2, "0")} · {selectedEp.name}
              </h2>
              {loadingStreams ? <p className="muted">Loading streams…</p> : null}
              {streamError ? (
                <StateBlock tone="error" title="Streams unavailable" message={streamError} />
              ) : null}
              {!loadingStreams && streams.length === 0 && !streamError ? (
                <StateBlock title="No streams" message="Torrentio returned no sources for this episode." />
              ) : null}
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
                  </select>
                </label>
              </div>
              {saved && saved.position > 15 && selectedEp ? (
                <StateBlock
                  tone="warn"
                  title={`Continue from ${formatResumeLabel(saved.position)}`}
                  message="Saved in this browser only. Resume or start this episode over."
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
                          clearContinueWatch(
                            seriesProgressId(imdbId, selectedEp.season, selectedEp.episode)
                          );
                          setSaved(null);
                        }}
                      >
                        Start over
                      </button>
                    </div>
                  }
                />
              ) : null}
              {!loadingStreams && streams.length > 0 && visibleStreams.length === 0 ? (
                <StateBlock
                  tone="warn"
                  title="No streams for this audio language"
                  message="Try Audio language → Any."
                />
              ) : null}
              {visibleStreams.length > 0 ? (
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
              ) : null}
            </section>
          ) : null}
        </article>
      ) : null}
    </SiteShell>
  );
}
