import Link from "next/link";
import type { CatalogTitle } from "@frankenstein/shared-types";

type Props = {
  items: CatalogTitle[];
  hrefFor: (item: CatalogTitle) => string;
  actionLabel?: string;
};

export function CatalogGrid({ items, hrefFor, actionLabel = "Open" }: Props) {
  return (
    <div className="card-grid media-grid">
      {items.map((item) => (
        <article key={item.id} className="media-card">
          <div
            className="media-poster"
            style={
              item.poster
                ? {
                    backgroundImage: `url(${item.poster})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }
                : undefined
            }
            aria-hidden
          />
          <div className="media-card-body">
            <h3>
              {item.name}
              {item.year ? ` (${item.year})` : ""}
            </h3>
            <p>{item.id}</p>
            <Link href={hrefFor(item)} className="accent-btn">
              {actionLabel}
            </Link>
          </div>
        </article>
      ))}
    </div>
  );
}
