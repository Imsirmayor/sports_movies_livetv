import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { LandingPage } from "./LandingPage";

afterEach(() => cleanup());

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/health")) {
        return new Response(
          JSON.stringify({
            status: "ok",
            service: "frankenstein-api",
            timestamp: "2026-10-25T00:00:00.000Z",
            ffmpegAvailable: true,
            mediaRootConfigured: true,
            activeSessions: 0,
            sportsProvider: "fixture",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
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
  it("renders category navigation", async () => {
    render(<LandingPage />);
    expect(screen.getByRole("heading", { name: /Your next stream starts here/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Explore Sports/i })).toHaveAttribute("href", "/sports");
    expect(screen.getByRole("link", { name: /Browse Movies/i })).toHaveAttribute("href", "/movies");
    expect(screen.getByRole("link", { name: /Explore Series/i })).toHaveAttribute("href", "/series");
    await waitFor(() => {
      expect(screen.getByText(/No live events|Sports unavailable/i)).toBeInTheDocument();
    });
  });
});
