"use client";

import { useEffect, useState } from "react";
import { formatCountdown, formatStartTime } from "@/lib/format";

type Props = {
  startTime: string | null | undefined;
  status?: string;
  className?: string;
  /** Called once when countdown reaches zero (kickoff). */
  onElapsed?: () => void;
};

/**
 * Ticking countdown for upcoming matches. Shows "LIVE NOW" when status is live.
 */
export function MatchCountdown({
  startTime,
  status,
  className,
  onElapsed,
}: Props) {
  const [now, setNow] = useState(() => Date.now());
  const [fired, setFired] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!startTime || fired || !onElapsed) return;
    const start = Date.parse(startTime);
    if (Number.isFinite(start) && start <= now) {
      setFired(true);
      onElapsed();
    }
  }, [startTime, now, fired, onElapsed]);

  if (status === "live") {
    return <span className={className ?? "pulse-countdown is-live"}>LIVE NOW</span>;
  }

  const label = formatCountdown(startTime, now);
  if (!label) {
    return (
      <span className={className ?? "pulse-countdown"}>
        {formatStartTime(startTime ?? null)}
      </span>
    );
  }

  return (
    <span className={className ?? "pulse-countdown"} title={formatStartTime(startTime ?? null)}>
      {label}
    </span>
  );
}
