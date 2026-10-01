// The Google tag, loaded by hand rather than through @next/third-parties:
// that component runs `gtag('config')` itself and has no place to put the
// Consent Mode `default` call before it. Here the order is explicit.

export const GOOGLE_SCRIPT_ID = "bp-gtag";

/** Advertising signals are denied always; only analytics_storage ever changes. */
export const GOOGLE_CONSENT_DENIED = {
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
  analytics_storage: "denied",
} as const;

type Gtag = (...args: unknown[]) => void;
interface GoogleWindow {
  dataLayer?: unknown[];
  gtag?: Gtag;
}

const googleWindow = (): GoogleWindow => window as unknown as GoogleWindow;

let lastPagePath: string | null = null;

export function googleTagLoaded(): boolean {
  return document.getElementById(GOOGLE_SCRIPT_ID) !== null;
}

/**
 * Queues, in this order: consent default (all four denied), consent update
 * (analytics_storage granted only), js, config; then adds gtag.js. Call it
 * only after the visitor accepted.
 *
 * `send_page_view: false` because page views are sent by hand per pathname
 * (see sendPageView): the landing navigates by hash, which the "page
 * changes based on browser history events" setting would count as page
 * views. `cookie_domain` is this app's own host, so `_ga` is not written to
 * the parent domain.
 */
export function loadGoogleTag(measurementId: string, host: string): void {
  if (googleTagLoaded()) return;
  lastPagePath = null;
  const w = googleWindow();
  w.dataLayer = w.dataLayer ?? [];
  const dataLayer = w.dataLayer;
  w.gtag = function gtag(): void {
    // gtag.js only recognises commands pushed as an `arguments` object, not as an array.
    // eslint-disable-next-line prefer-rest-params
    dataLayer.push(arguments);
  };
  w.gtag("consent", "default", { ...GOOGLE_CONSENT_DENIED });
  w.gtag("consent", "update", { analytics_storage: "granted" });
  w.gtag("js", new Date());
  w.gtag("config", measurementId, {
    send_page_view: false,
    cookie_domain: host,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });

  const script = document.createElement("script");
  script.id = GOOGLE_SCRIPT_ID;
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(script);
}

export function sendGoogleEvent(name: string, params: Record<string, unknown>): void {
  googleWindow().gtag?.("event", name, params);
}

/** One page_view per pathname change; a repeat of the path just sent (React strict mode) is dropped. */
export function sendPageView(pathname: string): void {
  if (!googleTagLoaded() || pathname === lastPagePath) return;
  lastPagePath = pathname;
  sendGoogleEvent("page_view", {
    page_path: pathname,
    page_location: window.location.origin + pathname,
    page_title: document.title,
  });
}

export function denyGoogleConsent(): void {
  googleWindow().gtag?.("consent", "update", { analytics_storage: "denied" });
  lastPagePath = null;
}
