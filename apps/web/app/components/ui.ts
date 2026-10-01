"use client";

// @bullpen/ui's barrel mixes plain components and hooks without a "use
// client" directive of its own, so a Server Component (the layout, the
// footer) cannot import it directly. Re-exporting through this one client
// file draws the boundary here -- the same fix apps/landing's
// app/components/ui.ts makes.
export { Analytics, ConsentBanner, CookieSettingsButton, useOutboundClickTracking } from "@bullpen/ui";
export type { AnalyticsConfig } from "@bullpen/ui";
