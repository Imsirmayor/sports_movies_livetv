import { createHash } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import type { MediaItem } from "@frankenstein/shared-types";
import { assertFileInsideRoot } from "@frankenstein/media-worker";

const ALLOWED_EXTENSIONS = new Set([".mp4", ".mkv", ".webm", ".mov", ".m4v"]);

export interface CatalogEntry extends MediaItem {
  absolutePath: string;
}

function mediaIdForRelativePath(relativePath: string): string {
  return createHash("sha256").update(relativePath).digest("hex").slice(0, 16);
}

export class MediaCatalog {
  private readonly mediaRoot: string;
  private entries = new Map<string, CatalogEntry>();

  constructor(mediaRoot: string) {
    this.mediaRoot = mediaRoot;
  }

  async refresh(): Promise<void> {
    const next = new Map<string, CatalogEntry>();
    const names = await readdir(this.mediaRoot);
    for (const name of names) {
      if (name.startsWith(".")) continue;
      const absolutePath = join(this.mediaRoot, name);
      let info;
      try {
        info = await stat(absolutePath);
      } catch {
        continue;
      }
      if (!info.isFile()) continue;
      const extension = extname(name).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(extension)) continue;

      // Only allow files that resolve inside the root (blocks symlink escapes)
      let safePath: string;
      try {
        safePath = assertFileInsideRoot(this.mediaRoot, absolutePath);
      } catch {
        continue;
      }

      const relativePath = name; // flat directory for Phase Two
      const id = mediaIdForRelativePath(relativePath);
      next.set(id, {
        id,
        title: basename(name, extension),
        filename: name,
        extension: extension.slice(1),
        sizeBytes: info.size,
        absolutePath: safePath,
      });
    }
    this.entries = next;
  }

  list(): MediaItem[] {
    return [...this.entries.values()].map(({ absolutePath: _a, ...item }) => item);
  }

  search(query: string): MediaItem[] {
    const q = query.trim().toLowerCase();
    if (!q) return this.list();
    return this.list().filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.filename.toLowerCase().includes(q) ||
        item.id === q
    );
  }

  get(id: string): CatalogEntry | undefined {
    return this.entries.get(id);
  }
}
