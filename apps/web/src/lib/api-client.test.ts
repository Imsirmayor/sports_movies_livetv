import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "./api-client";
import { ApiClientError } from "./api-error";

describe("createApiClient", () => {
  it("parses health responses", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          status: "ok",
          service: "frankenstein-api",
          timestamp: "2026-10-25T00:00:00.000Z",
          ffmpegAvailable: true,
          mediaRootConfigured: true,
          activeSessions: 0,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const client = createApiClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const health = await client.getHealth();
    expect(health.status).toBe("ok");
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/backend/health",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("maps API error bodies", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          error: { code: "UNAUTHORIZED", message: "Invalid API token" },
        }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      )
    );
    const client = createApiClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(client.listMedia()).rejects.toMatchObject({
      name: "ApiClientError",
      code: "UNAUTHORIZED",
      status: 401,
    } satisfies Partial<ApiClientError>);
  });

  it("rewrites playlist URLs through the BFF", () => {
    const client = createApiClient();
    expect(client.toProxiedPlaylistUrl("/api/playback/abc/stream/index.m3u8")).toBe(
      "/api/backend/playback/abc/stream/index.m3u8"
    );
    expect(client.toProxiedPlaylistUrl(null)).toBeNull();
  });

  it("rejects invalid response shapes", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ nope: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
    );
    const client = createApiClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(client.getHealth()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("searches sports events with filters", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          events: [],
          ambiguous: false,
          filters: { team: "Arsenal", status: "upcoming" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const client = createApiClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const res = await client.searchSportsEvents({ team: "Arsenal", status: "upcoming" });
    expect(res.events).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/backend/sports/events?team=Arsenal&status=upcoming",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("starts sports playback", async () => {
    const session = {
      sessionId: "11111111-1111-4111-8111-111111111111",
      mediaId: "media-1",
      eventId: "evt-1",
      kind: "live",
      capabilities: { seek: false, pause: false },
      status: "starting",
      playlistUrl: "/api/playback/11111111-1111-4111-8111-111111111111/stream/index.m3u8",
      createdAt: "2026-10-25T00:00:00.000Z",
      updatedAt: "2026-10-25T00:00:00.000Z",
      errorCode: null,
      errorMessage: null,
      ffmpegPid: null,
    };
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify(session), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        })
    );
    const client = createApiClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const out = await client.startSportsPlayback("evt-1");
    expect(out.kind).toBe("live");
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/backend/sports/playback",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ eventId: "evt-1" }),
      })
    );
  });
});
