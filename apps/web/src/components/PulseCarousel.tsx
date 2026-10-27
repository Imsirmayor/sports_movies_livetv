"use client";

import {
  Children,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";

type Props = {
  title: string;
  href?: string;
  linkLabel?: string;
  children: ReactNode;
  className?: string;
  /** Auto-advance interval in ms. Set 0 to disable. */
  autoSlideMs?: number;
};

export function PulseCarousel({
  title,
  href,
  linkLabel = "See all",
  children,
  className = "",
  autoSlideMs = 4500,
}: Props) {
  const frameRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [stepPx, setStepPx] = useState(0);
  const [paused, setPaused] = useState(false);
  const items = useMemo(() => Children.toArray(children), [children]);

  const measure = useCallback(() => {
    const frame = frameRef.current;
    const track = trackRef.current;
    if (!frame || !track) return;

    const cards = Array.from(track.children) as HTMLElement[];
    if (cards.length === 0) {
      setPageCount(1);
      setStepPx(0);
      return;
    }

    const gap = Number.parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap || "16");
    const first = cards[0]!;
    const cardWidth = first.getBoundingClientRect().width;
    const visible = Math.max(1, Math.floor((frame.clientWidth + gap) / (cardWidth + gap)));
    const pages = Math.max(1, Math.ceil(cards.length / visible));
    const step = (cardWidth + gap) * visible;

    setStepPx(step);
    setPageCount(pages);
    setPage((p) => Math.min(p, pages - 1));
  }, []);

  useLayoutEffect(() => {
    measure();
  }, [measure, items.length]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(frame);
    return () => ro.disconnect();
  }, [measure]);

  const go = useCallback(
    (dir: -1 | 1) => {
      setPage((p) => {
        if (pageCount <= 1) return 0;
        return (p + dir + pageCount) % pageCount;
      });
    },
    [pageCount]
  );

  useEffect(() => {
    if (!autoSlideMs || autoSlideMs < 1000 || pageCount <= 1 || paused) return;
    const id = window.setInterval(() => go(1), autoSlideMs);
    return () => window.clearInterval(id);
  }, [autoSlideMs, pageCount, paused, go]);

  return (
    <section className={`pulse-section pulse-carousel-section ${className}`.trim()}>
      <div className="pulse-section-head">
        <h2>{title}</h2>
        {href ? (
          <Link href={href} className="pulse-link">
            {linkLabel}
          </Link>
        ) : null}
      </div>
      <div
        className="pulse-carousel-frame"
        ref={frameRef}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
      >
        <button
          type="button"
          className="pulse-carousel-arrow pulse-carousel-arrow--side pulse-carousel-arrow--left"
          aria-label={`Previous ${title}`}
          onClick={() => go(-1)}
        >
          ‹
        </button>
        <div className="pulse-carousel-viewport">
          <div
            className="pulse-carousel-track"
            ref={trackRef}
            style={{
              transform: `translate3d(${-page * stepPx}px, 0, 0)`,
            }}
          >
            {items}
          </div>
        </div>
        <button
          type="button"
          className="pulse-carousel-arrow pulse-carousel-arrow--side pulse-carousel-arrow--right"
          aria-label={`Next ${title}`}
          onClick={() => go(1)}
        >
          ›
        </button>
      </div>
    </section>
  );
}
