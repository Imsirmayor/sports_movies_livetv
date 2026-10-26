import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { HealthBadge } from "./HealthBadge";

afterEach(() => cleanup());

describe("HealthBadge", () => {
  it("shows offline state", () => {
    render(<HealthBadge health={null} loading={false} error="NETWORK" />);
    expect(screen.getByRole("status")).toHaveTextContent("API offline");
  });

  it("shows healthy state", () => {
    render(
      <HealthBadge
        health={{
          status: "ok",
          service: "frankenstein-api",
          timestamp: "2026-10-25T00:00:00.000Z",
          ffmpegAvailable: true,
          mediaRootConfigured: true,
          activeSessions: 2,
        }}
        loading={false}
        error={null}
      />
    );
    expect(screen.getByRole("status")).toHaveTextContent("API healthy · 2 sessions");
  });
});
