import { Suspense } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { SeriesPage } from "./SeriesPage";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/series",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("@/lib/api-client", () => ({
  apiClient: {
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
    render(
      <Suspense>
        <SeriesPage />
      </Suspense>
    );
    expect(screen.queryByText(/Backend capability missing/i)).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: /Breaking Bad/i })).toBeInTheDocument();
    });
  });
});
