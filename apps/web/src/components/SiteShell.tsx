import type { ReactNode } from "react";
import { SiteHeader } from "./SiteHeader";

type Props = {
  children: ReactNode;
  searchHref?: string;
  searchPlaceholder?: string;
};

export function SiteShell({ children, searchHref, searchPlaceholder }: Props) {
  return (
    <div className="site-shell">
      <SiteHeader searchHref={searchHref} searchPlaceholder={searchPlaceholder} />
      <main className="site-main">{children}</main>
      <footer className="site-footer">
        <p>
          Educational local streaming client. Playback uses your configured API — not a public
          broadcast service.
        </p>
      </footer>
    </div>
  );
}
