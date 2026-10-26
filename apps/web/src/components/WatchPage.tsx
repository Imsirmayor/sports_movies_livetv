"use client";

import { useSearchParams } from "next/navigation";
import { SiteShell } from "./SiteShell";
import { WatchSession } from "./WatchSession";

type Props = { sessionId: string };

export function WatchPage({ sessionId }: Props) {
  const params = useSearchParams();
  const title = params.get("title") || "Playback";
  const from = params.get("from") || "/";
  const progressId = params.get("progress");
  const t = Number.parseFloat(params.get("t") || "0");
  const startAtSeconds = Number.isFinite(t) && t > 0 ? t : 0;
  const catalogType = params.get("type") === "series" ? "series" : params.get("type") === "movie" ? "movie" : null;
  const imdbId = params.get("imdb");
  const season = Number.parseInt(params.get("season") || "", 10);
  const episode = Number.parseInt(params.get("episode") || "", 10);
  const sub = params.get("sub");
  const embedded = params.get("embed") === "1";

  const session = (
    <WatchSession
      sessionId={sessionId}
      title={title}
      backHref={from}
      progressId={progressId}
      startAtSeconds={startAtSeconds}
      catalogType={catalogType}
      imdbId={imdbId}
      season={Number.isFinite(season) ? season : null}
      episode={Number.isFinite(episode) ? episode : null}
      initialSubtitleLang={sub}
      embedded={embedded}
    />
  );

  if (embedded) {
    return <div className="watch-embed-root">{session}</div>;
  }

  return <SiteShell>{session}</SiteShell>;
}
