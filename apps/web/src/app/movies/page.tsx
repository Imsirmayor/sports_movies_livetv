import { Suspense } from "react";
import { MoviesPage } from "@/components/MoviesPage";
import { SiteShell } from "@/components/SiteShell";
import { StateBlock } from "@/components/StateBlock";

export default function MoviesRoute() {
  return (
    <Suspense
      fallback={
        <SiteShell>
          <StateBlock title="Loading movies…" message="Fetching the local media catalog." />
        </SiteShell>
      }
    >
      <MoviesPage />
    </Suspense>
  );
}
