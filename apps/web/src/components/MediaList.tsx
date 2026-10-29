import type { MediaItem } from "@frankenstein/shared-types";

type Props = {
  items: MediaItem[];
  selectedId: string | null;
  onSelect: (item: MediaItem) => void;
  emptyMessage?: string;
  variant?: "list" | "cards";
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function MediaList({
  items,
  selectedId,
  onSelect,
  emptyMessage,
  variant = "list",
}: Props) {
  if (items.length === 0) {
    return (
      <div className="state-panel" role="status">
        <h2>No media found</h2>
        <p>{emptyMessage ?? "Add a sample file under media/samples and refresh."}</p>
      </div>
    );
  }

  if (variant === "cards") {
    return (
      <div className="card-row" role="list" aria-label="Local sample media">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            role="listitem"
            className={`media-card${selectedId === item.id ? " active" : ""}`}
            onClick={() => onSelect(item)}
            aria-pressed={selectedId === item.id}
          >
            <div className="media-card-art" aria-hidden>
              <span className="badge">{item.extension.toUpperCase()}</span>
              {item.extension.toUpperCase()}
            </div>
            <div className="media-card-body">
              <h3>{item.title}</h3>
              <p>
                {item.filename} · {formatBytes(item.sizeBytes)}
              </p>
            </div>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="media-list" role="list" aria-label="Popular local media">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="listitem"
          className={`media-row${selectedId === item.id ? " active" : ""}`}
          onClick={() => onSelect(item)}
          aria-pressed={selectedId === item.id}
        >
          <div className="thumb" aria-hidden>
            {item.extension.toUpperCase()}
          </div>
          <div>
            <h3>{item.title}</h3>
            <p>
              Local · {item.filename} · {formatBytes(item.sizeBytes)}
            </p>
          </div>
          <span className="watch-now-mini">Watch Now</span>
        </button>
      ))}
    </div>
  );
}
