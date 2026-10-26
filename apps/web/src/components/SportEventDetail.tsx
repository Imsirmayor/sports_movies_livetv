"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { SportEvent } from "@frankenstein/shared-types";
import { SiteShell } from "./SiteShell";
import { StateBlock } from "./StateBlock";
import { apiClient } from "@/lib/api-client";
import { isApiClientError } from "@/lib/api-error";
import { formatScore, formatStartTime } from "@/lib/format";

type Props = { eventId: string };

export function SportEventDetail({ eventId }: Props) {
  const router = useRouter();
  const [event, setEvent] = useState<SportEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [playError, setPlayError] = useState<string | null>(null);
  const [iframeSrc, setIframeSrc] = useState<string | null>(null);
  const [iframeReady, setIframeReady] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const e = await apiClient.getSportEvent(eventId);
        if (!cancelled) {
          setEvent(e);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setEvent(null);
          setError(isApiClientError(err) ? err.message : "Event not found");
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (ev.origin !== window.location.origin) return;
      const data = ev.data as { type?: string; sessionId?: string } | null;
      if (data?.type === "frankenstein:watch-stopped" && data.sessionId === sessionId) {
        setIframeSrc(null);
        setIframeReady(false);
        setSessionId(null);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [sessionId]);

  useEffect(() => {
    return () => {
      if (sessionId) {
        void apiClient.stopPlayback(sessionId).catch(() => undefined);
      }
    };
  }, [sessionId]);

  async function startWatch() {
    if (!event) return;
    setBusy(true);
    setPlayError(null);
    setIframeReady(false);

    // Fixture / Sportsurge: remux to same-origin HLS, then iframe our player
    // (provider pages send X-Frame-Options and cannot be framed directly).
    try {
      if (sessionId) {
        void apiClient.stopPlayback(sessionId).catch(() => undefined);
      }

      const session = await apiClient.startSportsPlayback(event.id, {
        timeoutMs: 180_000,
      });
      setSessionId(session.sessionId);

      if (event.streamAvailability === "fixture" && event.provider !== "sportsurge") {
        router.push(
          `/watch/${session.sessionId}?title=${encodeURIComponent(event.title)}&from=${encodeURIComponent(`/sports/${event.id}`)}&kind=live`
        );
        return;
      }

      const src = `/watch/${encodeURIComponent(session.sessionId)}?embed=1&title=${encodeURIComponent(event.title)}&from=${encodeURIComponent(`/sports/${event.id}`)}`;
      console.info("[WatchLive] iframe player", src, "playlist", session.playlistUrl);
      setIframeSrc(src);
    } catch (err) {
      setPlayError(isApiClientError(err) ? err.message : "Could not start playback");
      setIframeSrc(null);
    } finally {
      setBusy(false);
    }
  }

  const playable =
    event?.streamAvailability === "fixture" || event?.streamAvailability === "available";

  const watchHint =
    event?.provider === "sportsurge"
      ? "Resolves the live HLS source and plays it in an in-page player iframe (same-origin — the provider page itself blocks framing)."
      : event?.streamAvailability === "fixture"
        ? "Educational fixture — plays a local MEDIA_ROOT file as a live stand-in."
        : null;

  const showPlayer = Boolean(iframeSrc);
  const showLoader = busy || (showPlayer && !iframeReady);

  return (
    <SiteShell searchHref="/sports" searchPlaceholder="Search sports">
      {error ? <StateBlock tone="error" title="Event unavailable" message={error} /> : null}
      {!error && !event ? <StateBlock title="Loading…" message="Fetching event details." /> : null}
      {event ? (
        <article className="detail-panel">
          <p className="eyebrow">
            {event.competition} · {event.sport}
          </p>
          <h1>{event.title}</h1>
          <ul className="detail-meta">
            <li>
              <strong>Status</strong> {event.status}
            </li>
            <li>
              <strong>Start</strong> {formatStartTime(event.startTime)}
            </li>
            {event.homeTeam ? (
              <li>
                <strong>Home</strong> {event.homeTeam}
              </li>
            ) : null}
            {event.awayTeam ? (
              <li>
                <strong>Away</strong> {event.awayTeam}
              </li>
            ) : null}
            {formatScore(event.score) ? (
              <li>
                <strong>Score</strong> {formatScore(event.score)}
              </li>
            ) : null}
            <li>
              <strong>Stream</strong> {event.streamAvailability}
            </li>
            <li>
              <strong>Provider</strong> {event.provider}
            </li>
          </ul>

          {playError ? (
            <StateBlock tone="error" title="Playback failed" message={playError} />
          ) : null}

          {watchHint ? <p className="muted">{watchHint}</p> : null}

          {showPlayer || showLoader ? (
            <section className="sport-embed" aria-label={`${event.title} live stream`}>
              <div className="sport-embed-frame">
                {showLoader ? (
                  <div className="sport-embed-loader" role="status" aria-live="polite">
                    <span className="sport-embed-spinner" aria-hidden />
                    <p>{busy ? "Starting live stream…" : "Loading player…"}</p>
                  </div>
                ) : null}
                {iframeSrc ? (
                  <iframe
                    key={iframeSrc}
                    src={iframeSrc}
                    title={`${event.title} live stream`}
                    allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                    allowFullScreen
                    onLoad={() => setIframeReady(true)}
                  />
                ) : null}
              </div>
            </section>
          ) : null}

          {playable && !showPlayer ? (
            <button type="button" className="accent-btn" disabled={busy} onClick={() => void startWatch()}>
              {busy ? "Starting…" : "Watch live"}
            </button>
          ) : null}

          {playable && showPlayer ? (
            <button
              type="button"
              className="ghost-btn"
              disabled={busy}
              onClick={() => void startWatch()}
            >
              {busy ? "Restarting…" : "Restart stream"}
            </button>
          ) : null}

          {!playable ? (
            <StateBlock
              tone="warn"
              title="No playable stream"
              message={
                event.streamAvailability === "provider_required"
                  ? "An authorized live stream provider is required for this event."
                  : "Schedule only — Sportsurge is offline and local sample files are no longer used as fake live matches."
              }
            />
          ) : null}
        </article>
      ) : null}
    </SiteShell>
  );
}
