"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { PRIVACY_URL } from "../lib/landingUrl.js";
import { Analytics, ConsentBanner, useOutboundClickTracking, type AnalyticsConfig } from "./ui.js";

export function AnalyticsHost({ config, part }: { config: AnalyticsConfig | null; part: number | null }): ReactNode {
  const pathname = usePathname();
  useOutboundClickTracking();
  return (
    <>
      <Analytics config={config} part={part} pathname={pathname} />
      <ConsentBanner privacyHref={PRIVACY_URL} />
    </>
  );
}
