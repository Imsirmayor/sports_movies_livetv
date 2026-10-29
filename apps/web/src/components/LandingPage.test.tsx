import { Suspense } from "react";
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { LandingPage } from "./LandingPage";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

afterEach(() => cleanup());

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/sports/events")) {
        return new Response(JSON.stringify({ events: [], ambiguous: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/catalog/movies") || url.includes("/catalog/series")) {
        return new Response(
          JSON.stringify({ items: [], providerConfigured: true }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/media")) {
        return new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: { code: "NOT_FOUND", message: "no" } }), {
        status: 404,
      });
    })
  );
});

describe("LandingPage", () => {
  it("renders Pulse home banner and channel filters", async () => {
    render(
      <Suspense>
        <LandingPage />
      </Suspense>
    );
    expect(
      screen.getByRole("heading", { level: 1, name: /Your next stream starts here/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /All Channels/i })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Explore Sports/i })[0]).toHaveAttribute(
      "href",
      "/sports"
    );
    expect(screen.getAllByRole("link", { name: /Browse Movies/i })[0]).toHaveAttribute(
      "href",
      "/movies"
    );
    expect(screen.getAllByRole("link", { name: /Explore Series/i })[0]).toHaveAttribute(
      "href",
      "/series"
    );
    await waitFor(() => {
      expect(screen.getByText(/No live events|Sports unavailable/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: /Live Sports on Air/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Top Trending Movies/i })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Originals & Complete Box Sets/i })
    ).toBeInTheDocument();
  });
});
