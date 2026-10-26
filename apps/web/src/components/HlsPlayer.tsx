"use client";

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import {
  IconForward,
  IconFullscreen,
  IconPause,
  IconPlay,
  IconRewind,
  IconStop,
} from "./Icons";

export type PlayerCapabilities = {
  seek: boolean;
  pause: boolean;
};

export type SubtitleOption = {
  lang: string;
  /** Proxied WebVTT URL (e.g. /api/backend/catalog/.../vtt). */
  src: string;
  label?: string;
};

type Props = {
  src: string | null;
  title: string;
  subtitle?: string;
  kind?: "vod" | "live";
  capabilities?: PlayerCapabilities;
  loading?: boolean;
  startAtSeconds?: number;
  onProgress?: (position: number, duration: number) => void;
  onNativeError?: (message: string) => void;
  onStop: () => void;
  stopping?: boolean;
  subtitleTracks?: SubtitleOption[];
  initialSubtitleLang?: string | null;
};

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function seekableEnd(video: HTMLVideoElement): number {
  if (video.seekable.length > 0) {
    return video.seekable.end(video.seekable.length - 1);
  }
  if (Number.isFinite(video.duration) && video.duration > 0) return video.duration;
  return video.currentTime;
}

/**
 * Plays backend HLS via hls.js (MSE) or native Safari HLS.
 * Controls stay available outside and inside fullscreen (fullscreen targets the wrap).
 */
export function HlsPlayer({
  src,
  title,
  subtitle,
  kind = "vod",
  capabilities = { seek: true, pause: true },
  loading,
  startAtSeconds = 0,
  onProgress,
  onNativeError,
  onStop,
  stopping,
  subtitleTracks = [],
  initialSubtitleLang = null,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const startAtRef = useRef(startAtSeconds);
  const resumedRef = useRef(false);
  const lastProgressSaveRef = useRef(0);
  const onProgressRef = useRef(onProgress);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [volume, setVolume] = useState(1);
  const [subLang, setSubLang] = useState<string>(initialSubtitleLang || "off");

  startAtRef.current = startAtSeconds;
  onProgressRef.current = onProgress;

  useEffect(() => {
    if (initialSubtitleLang) setSubLang(initialSubtitleLang);
  }, [initialSubtitleLang]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const tracks = video.textTracks;
    for (let i = 0; i < tracks.length; i++) {
      const t = tracks[i]!;
      t.mode = subLang !== "off" && t.language === subLang ? "showing" : "hidden";
    }
  }, [subLang, src, subtitleTracks]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    resumedRef.current = false;
    lastProgressSaveRef.current = 0;

    const cleanup = () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      video.removeAttribute("src");
      video.load();
      setPlaying(false);
      setCurrent(0);
      setDuration(0);
      setBufferedEnd(0);
    };

    if (!src) {
      cleanup();
      return;
    }

    cleanup();
    resumedRef.current = false;

    const applyResumeAndPlay = () => {
      const resumeAt = startAtRef.current;
      const end = seekableEnd(video);
      if (
        kind === "vod" &&
        capabilities.seek &&
        resumeAt > 0 &&
        !resumedRef.current &&
        end > resumeAt + 1
      ) {
        video.currentTime = resumeAt;
        resumedRef.current = true;
      }
      void video.play().catch((err: unknown) => {
        const name = err instanceof Error ? err.name : "";
        if (name === "NotAllowedError") {
          onNativeError?.(
            "Browser blocked autoplay — press Play to start (audio may need a click)."
          );
          return;
        }
        if (name !== "AbortError") {
          onNativeError?.(err instanceof Error ? err.message : "Playback could not start");
        }
      });
    };

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        liveDurationInfinity: kind === "vod",
      });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        applyResumeAndPlay();
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls.startLoad();
          return;
        }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
          return;
        }
        onNativeError?.(data.details || "HLS playback failed");
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      video.addEventListener("loadedmetadata", applyResumeAndPlay, { once: true });
    } else {
      onNativeError?.("This browser cannot play HLS");
    }

    return cleanup;
  }, [src, onNativeError, kind, capabilities.seek]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTime = () => {
      setCurrent(video.currentTime);
      setBufferedEnd(seekableEnd(video));
      if (kind !== "vod" || !capabilities.seek) return;
      const now = Date.now();
      if (now - lastProgressSaveRef.current < 5_000) return;
      lastProgressSaveRef.current = now;
      onProgressRef.current?.(video.currentTime, video.duration || seekableEnd(video));
    };
    const onMeta = () => {
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
      setBufferedEnd(seekableEnd(video));
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => {
      setPlaying(false);
      if (kind === "vod" && capabilities.seek) {
        onProgressRef.current?.(video.currentTime, video.duration || seekableEnd(video));
      }
    };

    video.addEventListener("timeupdate", onTime);
    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("progress", onMeta);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    return () => {
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("progress", onMeta);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
    };
  }, [kind, capabilities.seek]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video || !src) return;
    if (!capabilities.pause && playing) return;
    if (video.paused) {
      video.muted = false;
      video.volume = volume > 0 ? volume : 1;
      if (volume === 0) setVolume(1);
      void video.play();
    } else video.pause();
  };

  const seekBy = (delta: number) => {
    const video = videoRef.current;
    if (!video || !src || !capabilities.seek) return;
    const end = seekableEnd(video);
    const next = Math.max(0, Math.min(end, video.currentTime + delta));
    video.currentTime = next;
    setCurrent(next);
  };

  const seekTo = (sec: number) => {
    const video = videoRef.current;
    if (!video || !src || !capabilities.seek) return;
    const end = seekableEnd(video);
    const next = Math.max(0, Math.min(end, sec));
    video.currentTime = next;
    setCurrent(next);
  };

  const toggleFullscreen = () => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void wrap.requestFullscreen?.();
    }
  };

  const onVolume = (v: number) => {
    setVolume(v);
    if (videoRef.current) {
      videoRef.current.volume = v;
      videoRef.current.muted = v === 0;
    }
  };

  const scrubMax = Math.max(bufferedEnd, duration, current, 1);
  const showDuration = Number.isFinite(duration) && duration > 0 ? duration : scrubMax;

  return (
    <div className="player-wrap" ref={wrapRef}>
      <div className="player-card">
        <video
          ref={videoRef}
          controls={false}
          playsInline
          crossOrigin="anonymous"
          aria-label={`Video player for ${title}`}
        >
          {subtitleTracks.map((t) => (
            <track
              key={t.lang}
              kind="subtitles"
              srcLang={t.lang}
              label={t.label || t.lang}
              src={t.src}
              default={t.lang === (initialSubtitleLang || "")}
            />
          ))}
        </video>
        {loading ? (
          <div className="player-loading">
            <span className="spinner" aria-hidden />
            Preparing stream…
          </div>
        ) : null}
        {src ? (
          <div className="player-overlay-title">
            <strong>
              {kind === "live" ? <span className="live-dot" aria-hidden /> : null}
              {title}
            </strong>
            {subtitle ? <span>{subtitle}</span> : null}
          </div>
        ) : null}
      </div>

      {capabilities.seek ? (
        <div className="seek-bar">
          <span className="seek-time">{formatTime(current)}</span>
          <input
            type="range"
            min={0}
            max={scrubMax}
            step={0.25}
            value={Math.min(current, scrubMax)}
            disabled={!src}
            aria-label="Seek"
            onChange={(e) => seekTo(Number(e.target.value))}
          />
          <span className="seek-time">{formatTime(showDuration)}</span>
        </div>
      ) : null}

      <div className="player-controls" role="group" aria-label="Playback controls">
        {capabilities.pause ? (
          <button
            type="button"
            className={playing ? "danger-btn" : "accent-btn"}
            onClick={togglePlay}
            disabled={!src}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <IconPause /> : <IconPlay />}
            {playing ? "Pause" : "Play"}
          </button>
        ) : (
          <span className="status-chip">Live · pause not supported</span>
        )}
        {capabilities.seek ? (
          <>
            <button
              type="button"
              className="ghost-btn"
              onClick={() => seekBy(-10)}
              disabled={!src}
              aria-label="Seek back 10 seconds"
            >
              <IconRewind />
              10s
            </button>
            <button
              type="button"
              className="ghost-btn"
              onClick={() => seekBy(10)}
              disabled={!src}
              aria-label="Seek forward 10 seconds"
            >
              <IconForward />
              10s
            </button>
          </>
        ) : (
          <span className="status-chip">Seek / DVR not available</span>
        )}
        <label className="volume-control">
          <span className="sr-only">Volume</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => onVolume(Number(e.target.value))}
            disabled={!src}
            aria-label="Volume"
          />
        </label>
        {subtitleTracks.length > 0 ? (
          <label className="player-select">
            <span className="sr-only">Subtitles</span>
            <select
              value={subLang}
              onChange={(e) => setSubLang(e.target.value)}
              disabled={!src}
              aria-label="Subtitles"
            >
              <option value="off">Subs off</option>
              {subtitleTracks.map((t) => (
                <option key={t.lang} value={t.lang}>
                  {t.label || t.lang.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button
          type="button"
          className="ghost-btn"
          onClick={toggleFullscreen}
          disabled={!src}
          aria-label="Fullscreen"
        >
          <IconFullscreen />
        </button>
        <button
          type="button"
          className="danger-btn"
          onClick={onStop}
          disabled={!src || stopping}
          aria-label="Stop playback session"
        >
          <IconStop />
          {stopping ? "Stopping…" : "Stop session"}
        </button>
      </div>
    </div>
  );
}
