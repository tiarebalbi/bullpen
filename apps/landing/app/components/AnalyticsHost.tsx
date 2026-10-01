"use client";

import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { adrNumberFromHash, seriesPartFromLabel } from "../lib/siteEvents.js";
import { Analytics, ConsentBanner, track, useOutboundClickTracking, type AnalyticsConfig } from "./ui.js";

/**
 * Document-level listeners for the events that come from series links and
 * the URL hash, so the components that own them do not have to know about
 * analytics. (Outbound links are tracked by the hook shared with the trading
 * app.) `track` does nothing until the visitor has accepted.
 */
function useSiteEvents(): void {
  useEffect(() => {
    const onHashChange = (): void => {
      const adr = adrNumberFromHash(window.location.hash);
      if (adr !== null) track("adr_open", { adr_number: adr });
    };
    const onClick = (event: MouseEvent): void => {
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest("a[href]");
      const card = anchor?.closest(".bp-series-card");
      if (card) {
        const part = seriesPartFromLabel(card.querySelector("span")?.textContent);
        if (part !== null) track("series_part_click", { part_number: part });
      }
    };
    window.addEventListener("hashchange", onHashChange);
    document.addEventListener("click", onClick);
    document.addEventListener("auxclick", onClick);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
      document.removeEventListener("click", onClick);
      document.removeEventListener("auxclick", onClick);
    };
  }, []);
}

export function AnalyticsHost({ config, part }: { config: AnalyticsConfig | null; part: number | null }): ReactNode {
  const pathname = usePathname();
  useSiteEvents();
  useOutboundClickTracking();
  return (
    <>
      <Analytics config={config} part={part} pathname={pathname} />
      <ConsentBanner privacyHref="/privacy" />
    </>
  );
}
