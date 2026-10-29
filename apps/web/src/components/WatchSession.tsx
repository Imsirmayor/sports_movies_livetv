"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PlaybackSession } from "@frankenstein/shared-types";
import { apiClient, CLIENT_API_PREFIX } from "@/lib/api-client";
import { isApiClientError } from "@/lib/api-error";
import { saveContinueWatch } from "@/lib/continue-watching";
import { HlsPlayer, type SubtitleOption } from "./HlsPlayer";
import { PreRollAd } from "./PreRollAd";
import { StateBlock } from "./StateBlock";

type Props = {
  sessionId: string;
  title: string;
  subtitle?: string;
  backHref: string;
  progressId?: string | null;
  startAtSeconds?: number;
  catalogType?: "movie" | "series" | null;
  imdbId?: string | null;
  season?: number | null;
  episode?: number | null;
  /** Following episode to warm while this one plays. */
  nextSeason?: number | null;
  nextEpisode?: number | null;
  initialSubtitleLang?: string | null;
  /** Compact player for embedding in a same-origin iframe. */
  embedded?: boolean;
};

export function WatchSession({
  sessionId,
  title,
  subtitle,
  backHref,
  progressId,
  startAtSeconds = 0,
  catalogType = null,
  imdbId = null,
  season = null,
  episode = null,
  nextSeason = null,
  nextEpisode = null,
  initialSubtitleLang = null,
  embedded = false,
}: Props) {
  const router = useRouter();
  const [session, setSession] = useState<PlaybackSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleOption[]>([]);
  const [prerollDone, setPrerollDone] = useState(false);
  const stoppedRef = useRef(false);
  const nextWarmedRef = useRef(false);
  const midWarmRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const s = await apiClient.getPlayback(sessionId);
      setSession(s);
      setError(null);
      if (s.status === "failed") {
        setError(s.errorMessage || "Playback session failed");
      }
    } catch (err) {
      setError(isApiClientError(err) ? err.message : "Failed to load session");
    }
  }, [sessionId]);

  useEffect(() => {
    stoppedRef.current = false;
    void refresh();
    const id = window.setInterval(() => {
      if (stoppedRef.current) return;
      void refresh();
    }, 800);
    return () => window.clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    if (!imdbId || !catalogType) return;
    let cancelled = false;
    void (async () => {
      try {
        const res =
          catalogType === "series" && season && episode
            ? await apiClient.listCatalogSeriesSubtitles(imdbId, season, episode)
            : await apiClient.listCatalogMovieSubtitles(imdbId);
        if (cancelled) return;
        setSubtitleTracks(
          res.subtitles.map((s) => ({
            lang: s.lang,
            label: s.lang.toUpperCase(),
            src: s.vttPath.startsWith("/api/")
              ? `${CLIENT_API_PREFIX}${s.vttPath.slice("/api".length)}`
              : s.vttPath,
          }))
        );
      } catch {
        /* subtitles optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [imdbId, catalogType, season, episode]);

  const warmNextEpisode = useCallback(() => {
    if (!imdbId || catalogType !== "series") return;
    if (!nextSeason || !nextEpisode) return;
    void apiClient
      .warmCatalogSeries(imdbId, nextSeason, nextEpisode)
      .catch(() => undefined);
  }, [imdbId, catalogType, nextSeason, nextEpisode]);

  // Start warming the next episode as soon as this session is ready.
  useEffect(() => {
    if (!session || session.status !== "ready") return;
    if (nextWarmedRef.current) return;
    nextWarmedRef.current = true;
    warmNextEpisode();
  }, [session, warmNextEpisode]);

  const persistProgress = useCallback(
    (position: number, duration: number) => {
      if (!progressId) return;
      saveContinueWatch({
        id: progressId,
        title,
        position,
        duration,
        href: backHref,
      });
      // Re-warm mid-episode so remux finishes before the credit roll.
      if (
        !midWarmRef.current &&
        duration > 60 &&
        position / duration >= 0.55
      ) {
        midWarmRef.current = true;
        warmNextEpisode();
      }
    },
    [progressId, title, backHref, warmNextEpisode]
  );

  const stop = useCallback(async () => {
    if (stoppedRef.current) return;
    stoppedRef.current = true;
    setStopping(true);
    try {
      await apiClient.stopPlayback(sessionId);
    } catch {
      /* best-effort cleanup */
    } finally {
      setStopping(false);
      if (embedded) {
        try {
          window.parent.postMessage({ type: "frankenstein:watch-stopped", sessionId }, window.location.origin);
        } catch {
          /* ignore */
        }
      } else {
        router.push(backHref);
      }
    }
  }, [sessionId, router, backHref, embedded]);

  useEffect(() => {
    const onPageHide = () => {
      if (stoppedRef.current) return;
      stoppedRef.current = true;
      void apiClient.stopPlayback(sessionId).catch(() => undefined);
    };
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [sessionId]);

  if (error && !session) {
    return (
      <StateBlock
        tone="error"
        title="Playback unavailable"
        message={error}
        action={
          embedded ? null : (
            <button type="button" className="ghost-btn" onClick={() => router.push(backHref)}>
              Go back
            </button>
          )
        }
      />
    );
  }

  const playlist = apiClient.toProxiedPlaylistUrl(session?.playlistUrl ?? null);
  const ready = session?.status === "ready" && Boolean(playlist);
  const starting = !session || session.status === "starting";
  const kind = session?.kind ?? "vod";
  const capabilities = session?.capabilities ?? { seek: true, pause: true };
  const contentType =
    catalogType === "series" || catalogType === "movie"
      ? catalogType
      : kind === "live"
        ? "sport"
        : "vod";

  if (!prerollDone) {
    return (
      <div className={embedded ? "watch-panel watch-panel-embed" : "watch-panel"}>
        <PreRollAd
          contentType={contentType}
          contentId={imdbId ?? sessionId}
          onDone={() => setPrerollDone(true)}
        />
      </div>
    );
  }

  return (
    <div className={embedded ? "watch-panel watch-panel-embed" : "watch-panel"}>
      {embedded ? null : (
        <div className="watch-heading">
          <button type="button" className="ghost-btn" onClick={() => void stop()}>
            ← Back
          </button>
          <div>
            <h1>{title}</h1>
            {subtitle ? <p>{subtitle}</p> : null}
            {session ? (
              <p className="muted">
                Session {session.status}
                {kind === "live" ? " · live" : " · VOD"}
                {kind === "vod" && startAtSeconds > 15
                  ? ` · resuming at ${Math.floor(startAtSeconds / 60)}:${String(
                      Math.floor(startAtSeconds % 60)
                    ).padStart(2, "0")}`
                  : null}
              </p>
            ) : null}
          </div>
        </div>
      )}

      {playerError || error ? (
        <StateBlock
          tone="error"
          title="Stream error"
          message={playerError || error || "Unknown error"}
          action={
            <button type="button" className="accent-btn" onClick={() => void refresh()}>
              Refresh status
            </button>
          }
        />
      ) : null}

      <HlsPlayer
        src={ready ? playlist : null}
        title={title}
        subtitle={subtitle}
        kind={kind}
        capabilities={capabilities}
        loading={starting}
        startAtSeconds={kind === "vod" ? startAtSeconds : 0}
        onProgress={kind === "vod" ? persistProgress : undefined}
        onNativeError={setPlayerError}
        onStop={() => void stop()}
        stopping={stopping}
        subtitleTracks={subtitleTracks}
        initialSubtitleLang={
          initialSubtitleLang && initialSubtitleLang !== "off" ? initialSubtitleLang : null
        }
      />
    </div>
  );
}
