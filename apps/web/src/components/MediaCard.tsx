import Link from "next/link";
import type { MediaItem } from "@frankenstein/shared-types";
import { formatBytes } from "@/lib/format";
import { IconFilm } from "./Icons";

type Props = {
  item: MediaItem;
  hrefBase?: "/movies" | "/series";
};

export function MediaCard({ item, hrefBase = "/movies" }: Props) {
  return (
    <article className="media-card">
      <div className="media-poster" aria-hidden>
        <IconFilm size={36} />
        <span>{item.extension.toUpperCase()}</span>
      </div>
      <div className="media-card-body">
        <h3>{item.title}</h3>
        <p>
          {item.filename} · {formatBytes(item.sizeBytes)}
        </p>
        <Link href={`${hrefBase}/${encodeURIComponent(item.id)}`} className="accent-btn">
          Details
        </Link>
      </div>
    </article>
  );
}
