import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearContinueWatch,
  formatResumeLabel,
  getContinueWatch,
  listContinueWatch,
  movieProgressId,
  saveContinueWatch,
  seriesProgressId,
} from "./continue-watching";

const STORE = new Map<string, string>();

beforeEach(() => {
  STORE.clear();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (k: string) => STORE.get(k) ?? null,
        setItem: (k: string, v: string) => {
          STORE.set(k, v);
        },
        removeItem: (k: string) => {
          STORE.delete(k);
        },
      },
    },
  });
});

afterEach(() => {
  // @ts-expect-error cleanup mock window
  delete globalThis.window;
});

describe("continue-watching", () => {
  it("saves and resumes movie progress in localStorage", () => {
    const id = movieProgressId("tt0111161");
    saveContinueWatch({
      id,
      title: "The Shawshank Redemption",
      position: 420,
      duration: 7200,
      href: "/movies/catalog/tt0111161",
    });
    const saved = getContinueWatch(id);
    expect(saved?.position).toBe(420);
    expect(formatResumeLabel(420)).toBe("7:00");
    expect(listContinueWatch()[0]?.title).toContain("Shawshank");
  });

  it("ignores tiny positions and clears near-complete watches", () => {
    const id = seriesProgressId("tt0903747", 1, 1);
    saveContinueWatch({
      id,
      title: "Breaking Bad S01E01",
      position: 10,
      duration: 3600,
      href: "/series/tt0903747",
    });
    expect(getContinueWatch(id)).toBeNull();

    saveContinueWatch({
      id,
      title: "Breaking Bad S01E01",
      position: 900,
      duration: 3600,
      href: "/series/tt0903747",
    });
    expect(getContinueWatch(id)?.position).toBe(900);

    saveContinueWatch({
      id,
      title: "Breaking Bad S01E01",
      position: 3500,
      duration: 3600,
      href: "/series/tt0903747",
    });
    expect(getContinueWatch(id)).toBeNull();
  });

  it("clearContinueWatch removes an entry", () => {
    const id = movieProgressId("tt1");
    saveContinueWatch({
      id,
      title: "Test",
      position: 100,
      duration: 1000,
      href: "/movies/catalog/tt1",
    });
    clearContinueWatch(id);
    expect(getContinueWatch(id)).toBeNull();
  });
});
