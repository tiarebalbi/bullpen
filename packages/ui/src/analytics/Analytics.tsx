"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { clarityLoaded, eraseClarity, loadClarity } from "./clarity.js";
import type { AnalyticsConfig } from "./config.js";
import { allowsAnalytics } from "./consent.js";
import { getConsentSnapshot, getServerConsentSnapshot, subscribeConsent } from "./consentStore.js";
import { clearAnalyticsCookies } from "./cookies.js";
import { denyGoogleConsent, googleTagLoaded, loadGoogleTag, sendGoogleEvent, sendPageView } from "./google.js";
import { setTrackTransport } from "./track.js";

export interface AnalyticsProps {
  /** Null outside production or with no ids: nothing is ever loaded. */
  config: AnalyticsConfig | null;
  /** The part of the series this deployment belongs to, sent to Clarity as the `part` tag. */
  part: number | null;
  /** The current route's pathname, so client-side navigation counts as a page view. */
  pathname: string;
  /** Test seam: how a withdrawal restarts the page. */
  reload?: () => void;
}

function reloadPage(): void {
  window.location.reload();
}

function startTags(config: { googleId: string | null; clarityId: string | null }, part: number | null): void {
  if (config.googleId) {
    loadGoogleTag(config.googleId, window.location.hostname);
    setTrackTransport(sendGoogleEvent);
  }
  if (config.clarityId) loadClarity(config.clarityId, part);
}

/** Withdrawal: stop sending, tell both tools, delete their cookies, and restart the page if a tag was running in it. */
function stopTags(reload: () => void): void {
  const hadTags = googleTagLoaded() || clarityLoaded();
  setTrackTransport(null);
  denyGoogleConsent();
  eraseClarity();
  clearAnalyticsCookies(document, window.location.hostname);
  // The tags are already running in this page; a reload is what stops them.
  if (hadTags) reload();
}

/**
 * Loads GA4 and Clarity, and only when all three hold: the deployment is
 * production with the tool's id set (`config`), and the visitor accepted.
 * Renders nothing.
 */
// metrics-gate: ignore[nesting] -- the measuring engine without tree-sitter adds up three sibling useEffect callbacks; the real depth is 2
export function Analytics({ config, part, pathname, reload }: AnalyticsProps): ReactNode {
  const consent = useSyncExternalStore(subscribeConsent, getConsentSnapshot, getServerConsentSnapshot);
  const allowed = consent.ready && allowsAnalytics(consent.state);
  const googleId = config?.googleId ?? null;
  const clarityId = config?.clarityId ?? null;

  useEffect(() => {
    if (allowed) startTags({ googleId, clarityId }, part);
  }, [allowed, googleId, clarityId, part]);

  useEffect(() => {
    if (allowed && googleId) sendPageView(pathname);
  }, [allowed, googleId, pathname]);

  useEffect(() => {
    if (consent.state === "withdrawn") stopTags(reload ?? reloadPage);
  }, [consent.state, reload]);

  return null;
}
