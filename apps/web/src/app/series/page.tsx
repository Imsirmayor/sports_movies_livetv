import { Suspense } from "react";
import { SeriesPage } from "@/components/SeriesPage";
import { SiteShell } from "@/components/SiteShell";
import { StateBlock } from "@/components/StateBlock";

export default function SeriesRoute() {
  return (
    <Suspense
      fallback={
        <SiteShell>
          <StateBlock title="Loading series…" message="Preparing catalog search." />
        </SiteShell>
      }
    >
      <SeriesPage />
    </Suspense>
  );
}
