import type { HealthStatus } from "@frankenstein/shared-types";

type Props = {
  health: HealthStatus | null;
  loading: boolean;
  error: string | null;
};

export function HealthBadge({ health, loading, error }: Props) {
  if (loading) {
    return (
      <span className="status-chip warn" role="status" aria-live="polite">
        Checking API…
      </span>
    );
  }
  if (error || !health) {
    return (
      <span className="status-chip bad" role="status" aria-live="polite">
        API offline
      </span>
    );
  }
  if (!health.ffmpegAvailable) {
    return (
      <span className="status-chip warn" role="status">
        API up · FFmpeg missing
      </span>
    );
  }
  return (
    <span className="status-chip ok" role="status">
      API healthy · {health.activeSessions} session
      {health.activeSessions === 1 ? "" : "s"}
    </span>
  );
}
