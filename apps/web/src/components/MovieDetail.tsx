"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { MediaItem } from "@frankenstein/shared-types";
import { SiteShell } from "./SiteShell";
import { StateBlock } from "./StateBlock";
import { apiClient } from "@/lib/api-client";
import { isApiClientError } from "@/lib/api-error";
import { formatBytes } from "@/lib/format";
import {
  clearContinueWatch,
  formatResumeLabel,
  getContinueWatch,
  localMediaProgressId,
  type ContinueWatchEntry,
} from "@/lib/continue-watching";

type Props = { movieId: string };

export function MovieDetail({ movieId }: Props) {
  const router = useRouter();
  const [item, setItem] = useState<MediaItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [playError, setPlayError] = useState<string | null>(null);
  const [saved, setSaved] = useState<ContinueWatchEntry | null>(null);
  const [resumeFromSaved, setResumeFromSaved] = useState(true);

  const progressId = localMediaProgressId(movieId);

  useEffect(() => {
    setSaved(getContinueWatch(progressId));
    setResumeFromSaved(true);
  }, [progressId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const m = await apiClient.getMedia(movieId);
        if (!cancelled) {
          setItem(m);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setItem(null);
          setError(isApiClientError(err) ? err.message : "Media not found");
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [movieId]);

  async function startWatch() {
    if (!item) return;
    setBusy(true);
    setPlayError(null);
    try {
      const session = await apiClient.startPlayback(item.id);
      const from = `/movies/${item.id}`;
      const t =
        resumeFromSaved && saved && saved.position > 15 ? Math.floor(saved.position) : 0;
      const qs = new URLSearchParams({
        title: item.title,
        from,
        progress: progressId,
      });
      if (t > 0) qs.set("t", String(t));
      router.push(`/watch/${session.sessionId}?${qs.toString()}`);
    } catch (err) {
      setPlayError(isApiClientError(err) ? err.message : "Could not start playback");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SiteShell searchHref="/movies">
      {error ? <StateBlock tone="error" title="Not found" message={error} /> : null}
      {!error && !item ? <StateBlock title="Loading…" message="Fetching media details." /> : null}
      {item ? (
        <article className="detail-panel">
          <p className="eyebrow">Local media · {item.extension}</p>
          <h1>{item.title}</h1>
          <ul className="detail-meta">
            <li>
              <strong>Filename</strong> {item.filename}
            </li>
            <li>
              <strong>Size</strong> {formatBytes(item.sizeBytes)}
            </li>
            <li>
              <strong>Id</strong> {item.id}
            </li>
          </ul>
          <p className="muted">
            Poster artwork, synopsis, year, and genres are not provided by the current media API.
          </p>
          {playError ? (
            <StateBlock tone="error" title="Playback failed" message={playError} />
          ) : null}
          {saved && saved.position > 15 ? (
            <StateBlock
              tone="warn"
              title={`Continue from ${formatResumeLabel(saved.position)}`}
              message="Saved in this browser only."
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
          <button type="button" className="accent-btn" disabled={busy} onClick={() => void startWatch()}>
            {busy
              ? "Starting…"
              : resumeFromSaved && saved && saved.position > 15
                ? `Resume · ${formatResumeLabel(saved.position)}`
                : "Watch"}
          </button>
        </article>
      ) : null}
    </SiteShell>
  );
}
