import { allowsAnalytics } from "./consent.js";
import { getConsentSnapshot } from "./consentStore.js";

/**
 * Every custom event, with the only parameters it may carry. Numbers and a
 * bare host: nothing a person typed, no URL paths or query strings, nothing
 * that could identify them.
 */
export interface AnalyticsEvents {
  series_part_click: { part_number: number };
  explorer_moment_change: { from_part: number; to_part: number };
  adr_open: { adr_number: number };
  outbound_click: { host: string };
}

type Transport = (name: string, params: Record<string, unknown>) => void;

let transport: Transport | null = null;

/** Set by <Analytics> once the Google tag is loaded, and cleared on withdrawal. */
export function setTrackTransport(next: Transport | null): void {
  transport = next;
}

/**
 * The one way components report an event. It does nothing until the visitor
 * has accepted and the tag is loaded, so call sites never check consent and
 * never touch gtag.
 */
export function track<E extends keyof AnalyticsEvents>(event: E, params: AnalyticsEvents[E]): void {
  if (!transport) return;
  if (!allowsAnalytics(getConsentSnapshot().state)) return;
  transport(event, { ...params });
}
