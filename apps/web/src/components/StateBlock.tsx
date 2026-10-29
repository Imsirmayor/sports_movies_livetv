import type { ReactNode } from "react";

type Props = {
  title: string;
  message: string;
  action?: ReactNode;
  tone?: "neutral" | "error" | "warn";
};

export function StateBlock({ title, message, action, tone = "neutral" }: Props) {
  return (
    <div className={`state-block tone-${tone}`} role="status">
      <h2>{title}</h2>
      <p>{message}</p>
      {action}
    </div>
  );
}

export function SkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="card-grid" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton-card" />
      ))}
    </div>
  );
}
