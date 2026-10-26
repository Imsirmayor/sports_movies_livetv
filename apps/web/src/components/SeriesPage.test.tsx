import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { SeriesPage } from "./SeriesPage";

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    getHealth: vi.fn(async () => ({
      status: "ok",
      service: "frankenstein-api",
      timestamp: "2026-10-25T00:00:00.000Z",
      ffmpegAvailable: true,
      mediaRootConfigured: true,
      activeSessions: 0,
      catalogConfigured: true,
    })),
    listCatalogSeries: vi.fn(async () => ({
      items: [
        {
          id: "tt0903747",
          name: "Breaking Bad",
          type: "series",
          year: "2008",
          poster: null,
        },
      ],
      providerConfigured: true,
    })),
    searchCatalogSeries: vi.fn(async () => ({
      query: "",
      items: [],
      providerConfigured: true,
    })),
  },
}));

afterEach(() => cleanup());

describe("SeriesPage", () => {
  it("loads popular series from the catalog API", async () => {
    render(<SeriesPage />);
    expect(screen.getByRole("heading", { name: "Series" })).toBeInTheDocument();
    expect(screen.queryByText(/Backend capability missing/i)).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/Breaking Bad/i)).toBeInTheDocument();
    });
  });
});
