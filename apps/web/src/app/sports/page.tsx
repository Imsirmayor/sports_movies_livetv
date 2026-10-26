import { Suspense } from "react";
import { SportsPage } from "@/components/SportsPage";
import { SiteShell } from "@/components/SiteShell";
import { StateBlock } from "@/components/StateBlock";

export default function SportsRoute() {
  return (
    <Suspense
      fallback={
        <SiteShell>
          <StateBlock title="Loading sports…" message="Fetching events from the API." />
        </SiteShell>
      }
    >
      <SportsPage />
    </Suspense>
  );
}
