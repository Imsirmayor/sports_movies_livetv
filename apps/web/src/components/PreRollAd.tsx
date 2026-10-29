"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AdsPrerollDecision } from "@frankenstein/shared-types";
import { apiClient } from "@/lib/api-client";

type Props = {
  contentType?: "movie" | "series" | "sport" | "vod";
  contentId?: string;
  /** Called when preroll finishes, is skipped, or ads are disabled. */
  onDone: () => void;
};

type ImaAdsManager = {
  destroy: () => void;
  init: (w: number, h: number, viewMode: unknown) => void;
  start: () => void;
  resize: (w: number, h: number, viewMode: unknown) => void;
  addEventListener: (t: string, fn: (...args: unknown[]) => void) => void;
};

declare global {
  interface Window {
    google?: {
      ima?: {
        AdDisplayContainer: new (
          el: HTMLElement,
          video?: HTMLVideoElement
        ) => { initialize: () => void };
        AdsLoader: new (container: unknown) => {
          addEventListener: (
            type: string,
            fn: (e: { getAdError?: () => { getMessage: () => string } }) => void
          ) => void;
          requestAds: (req: unknown) => void;
          contentComplete: () => void;
        };
        AdsRequest: new () => {
          adTagUrl: string;
          linearAdSlotWidth: number;
          linearAdSlotHeight: number;
          nonLinearAdSlotWidth: number;
          nonLinearAdSlotHeight: number;
        };
        AdsManagerLoadedEvent: { Type: { ADS_MANAGER_LOADED: string } };
        AdErrorEvent: { Type: { AD_ERROR: string } };
        AdEvent: {
          Type: {
            COMPLETE: string;
            SKIPPED: string;
            ALL_ADS_COMPLETED: string;
            STARTED: string;
            LOADED: string;
          };
        };
        ViewMode: { NORMAL: unknown; FULLSCREEN: unknown };
      };
    };
  }
}

function loadImaScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.ima) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-ima="1"]');
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("IMA load failed")));
      return;
    }
    const s = document.createElement("script");
    s.src = "https://imasdk.googleapis.com/js/sdkloader/ima3.js";
    s.async = true;
    s.dataset.ima = "1";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("IMA load failed"));
    document.head.appendChild(s);
  });
}

/**
 * Pre-roll gate before HLS playback.
 * Prefers VAST via Google IMA when configured; otherwise house creative.
 * Always unlocks Skip / Continue after skipAfterSec and auto-continues.
 */
export function PreRollAd({ contentType, contentId, onDone }: Props) {
  const [decision, setDecision] = useState<AdsPrerollDecision | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [canSkip, setCanSkip] = useState(false);
  const [vastError, setVastError] = useState<string | null>(null);
  const [mode, setMode] = useState<"loading" | "vast" | "house">("loading");
  const finishedRef = useRef(false);
  const decisionRef = useRef<AdsPrerollDecision | null>(null);
  const adContainerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const vastRootRef = useRef<HTMLDivElement>(null);

  const finish = useCallback(
    (event: "complete" | "skip" | "error", message?: string) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      const d = decisionRef.current;
      if (d) {
        void apiClient
          .trackAdEvent({
            decisionId: d.decisionId,
            event,
            network: d.network ?? undefined,
            platform: "web",
            message,
          })
          .catch(() => undefined);
      }
      onDone();
    },
    [onDone]
  );

  // Fetch decision
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const d = await apiClient.requestPreroll({
          platform: "web",
          contentType,
          contentId,
        });
        if (cancelled) return;
        if (!d.show) {
          onDone();
          return;
        }
        decisionRef.current = d;
        setDecision(d);
        const useVast = d.network === "vast" && Boolean(d.vastTagUrl);
        setMode(useVast ? "vast" : "house");
        void apiClient
          .trackAdEvent({
            decisionId: d.decisionId,
            event: "impression",
            network: d.network ?? undefined,
            platform: "web",
          })
          .catch(() => undefined);
      } catch {
        if (!cancelled) onDone();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contentType, contentId, onDone]);

  // Skip countdown for every mode (VAST + house). Auto-continue when it hits 0 for house.
  useEffect(() => {
    if (!decision || mode === "loading") return;
    const skipAfter = Math.max(0, decision.skipAfterSec ?? 0);
    setSecondsLeft(skipAfter);
    setCanSkip(skipAfter <= 0);
    if (skipAfter <= 0) return;

    const id = window.setInterval(() => {
      setSecondsLeft((s) => {
        if (s === null) return s;
        if (s <= 1) {
          window.clearInterval(id);
          setCanSkip(true);
          // House: auto-advance so users are never stuck on a static card.
          if (mode === "house") {
            window.setTimeout(() => finish("complete"), 0);
          }
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [decision, mode, finish]);

  // Fall back to house when VAST/IMA fails
  useEffect(() => {
    if (!vastError || !decision) return;
    setMode("house");
  }, [vastError, decision]);

  // VAST / IMA
  useEffect(() => {
    const tagUrl = decision?.vastTagUrl;
    if (mode !== "vast" || !decision || !tagUrl) return;
    const decisionId = decision.decisionId;
    let destroyed = false;
    let adsManager: ImaAdsManager | null = null;
    let resizeObs: ResizeObserver | null = null;

    void (async () => {
      try {
        await loadImaScript();
        if (destroyed || !window.google?.ima || !adContainerRef.current || !videoRef.current) {
          setVastError("IMA unavailable");
          return;
        }
        const ima = window.google.ima;
        const video = videoRef.current;
        const slot = adContainerRef.current;
        const root = vastRootRef.current;
        const w = Math.max(root?.clientWidth ?? 640, 320);
        const h = Math.max(root?.clientHeight ?? 360, 180);

        const container = new ima.AdDisplayContainer(slot, video);
        container.initialize();
        const loader = new ima.AdsLoader(container);

        loader.addEventListener(ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED, (e) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const ev = e as any;
          adsManager = ev.getAdsManager?.(video) as ImaAdsManager | null;
          if (!adsManager) {
            setVastError("No ads manager");
            return;
          }
          adsManager.addEventListener(ima.AdEvent.Type.STARTED, () => {
            void apiClient
              .trackAdEvent({
                decisionId,
                event: "start",
                network: "vast",
                platform: "web",
              })
              .catch(() => undefined);
          });
          adsManager.addEventListener(ima.AdEvent.Type.COMPLETE, () => finish("complete"));
          adsManager.addEventListener(ima.AdEvent.Type.SKIPPED, () => finish("skip"));
          adsManager.addEventListener(ima.AdEvent.Type.ALL_ADS_COMPLETED, () =>
            finish("complete")
          );

          try {
            adsManager.init(w, h, ima.ViewMode.NORMAL);
            adsManager.start();
            if (root && typeof ResizeObserver !== "undefined") {
              resizeObs = new ResizeObserver(() => {
                const nw = Math.max(root.clientWidth, 320);
                const nh = Math.max(root.clientHeight, 180);
                try {
                  adsManager?.resize(nw, nh, ima.ViewMode.NORMAL);
                } catch {
                  /* ignore */
                }
              });
              resizeObs.observe(root);
            }
          } catch (err) {
            setVastError(err instanceof Error ? err.message : "Ad start failed");
          }
        });

        loader.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, (e) => {
          const msg = e.getAdError?.().getMessage() ?? "VAST error";
          setVastError(msg);
        });

        const req = new ima.AdsRequest();
        req.adTagUrl = tagUrl;
        req.linearAdSlotWidth = w;
        req.linearAdSlotHeight = h;
        req.nonLinearAdSlotWidth = w;
        req.nonLinearAdSlotHeight = Math.min(h, 150);
        loader.requestAds(req);
      } catch (err) {
        setVastError(err instanceof Error ? err.message : "IMA failed");
      }
    })();

    return () => {
      destroyed = true;
      resizeObs?.disconnect();
      try {
        adsManager?.destroy();
      } catch {
        /* ignore */
      }
    };
  }, [mode, decision, finish]);

  if (!decision || mode === "loading") {
    return (
      <div className="preroll-root" role="status" aria-live="polite">
        <div className="preroll-card">
          <span className="spinner" aria-hidden />
          <p>Preparing stream…</p>
          <button type="button" className="ghost-btn" onClick={() => finish("skip")}>
            Skip
          </button>
        </div>
      </div>
    );
  }

  const house = decision.house;
  const skipLabel =
    (secondsLeft ?? 0) > 0 && !canSkip
      ? `Skip in ${secondsLeft}s`
      : "Skip ad";

  if (mode === "vast") {
    return (
      <div className="preroll-root" role="dialog" aria-label="Advertisement">
        <div className="preroll-vast" ref={vastRootRef}>
          <video
            ref={videoRef}
            className="preroll-vast-video"
            playsInline
            muted
            autoPlay
          />
          <div ref={adContainerRef} className="preroll-vast-slot" />
          <button
            type="button"
            className="ghost-btn preroll-skip"
            disabled={!canSkip}
            onClick={() => finish("skip")}
          >
            {skipLabel}
          </button>
          <button
            type="button"
            className="ghost-btn preroll-close"
            aria-label="Close ad"
            disabled={!canSkip}
            onClick={() => finish("skip")}
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="preroll-root" role="dialog" aria-label="Advertisement">
      <div className="preroll-card preroll-house">
        <div className="preroll-card-top">
          <span className="preroll-badge">Ad</span>
          <button
            type="button"
            className="ghost-btn preroll-close-inline"
            aria-label="Close ad"
            disabled={!canSkip}
            onClick={() => finish("skip")}
            title={canSkip ? "Close" : skipLabel}
          >
            ✕
          </button>
        </div>
        {house?.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={house.imageUrl} alt="" className="preroll-house-img" />
        ) : (
          <div className="preroll-house-mark" aria-hidden>
            ▶
          </div>
        )}
        <h2>{house?.title ?? "Advertisement"}</h2>
        <p>{house?.body ?? "Sponsored message before playback."}</p>
        <div className="preroll-actions">
          {house?.ctaUrl ? (
            <a
              className="accent-btn"
              href={house.ctaUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() => {
                void apiClient
                  .trackAdEvent({
                    decisionId: decision.decisionId,
                    event: "click",
                    network: decision.network ?? "house",
                    platform: "web",
                  })
                  .catch(() => undefined);
              }}
            >
              {house.ctaLabel}
            </a>
          ) : null}
          <button
            type="button"
            className="accent-btn"
            disabled={!canSkip}
            onClick={() => finish("skip")}
          >
            {canSkip ? "Continue to stream" : `Continue in ${secondsLeft ?? 0}s`}
          </button>
        </div>
        {vastError ? (
          <p className="muted preroll-note">Ad unavailable — continue shortly ({vastError})</p>
        ) : null}
      </div>
    </div>
  );
}
