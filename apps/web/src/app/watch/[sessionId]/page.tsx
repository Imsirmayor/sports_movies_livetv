import { Suspense } from "react";
import { WatchPage } from "@/components/WatchPage";
import { SiteShell } from "@/components/SiteShell";
import { StateBlock } from "@/components/StateBlock";

type Props = { params: Promise<{ sessionId: string }> };

export default async function WatchRoute({ params }: Props) {
  const { sessionId } = await params;
  return (
    <Suspense
      fallback={
        <SiteShell>
          <StateBlock title="Preparing player…" message="Loading playback session." />
        </SiteShell>
      }
    >
      <WatchPage sessionId={decodeURIComponent(sessionId)} />
    </Suspense>
  );
}
