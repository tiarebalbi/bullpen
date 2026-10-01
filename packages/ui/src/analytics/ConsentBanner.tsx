"use client";

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { Button } from "../components/Button.js";
import {
  closeConsentSettings,
  dispatchConsent,
  getConsentSnapshot,
  getServerConsentSnapshot,
  subscribeConsent,
} from "./consentStore.js";

export interface ConsentBannerProps {
  /** Where the privacy page lives: "/privacy" on the landing, an absolute URL from the trading app. */
  privacyHref: string;
}

const OPEN_ATTRIBUTE = "data-consent-open";
const HEIGHT_PROPERTY = "--bp-consent-height";

/**
 * Shown to every visitor until they choose, and again from the footer's
 * "Cookie settings". Accept and Reject are the same button, so neither is
 * pushed. It is a bar at the bottom of the viewport; while it is open the
 * page reserves its height (see styles.css), so it never hides the end of
 * the content.
 */
export function ConsentBanner({ privacyHref }: ConsentBannerProps): ReactNode {
  const consent = useSyncExternalStore(subscribeConsent, getConsentSnapshot, getServerConsentSnapshot);
  const visible = consent.ready && (consent.state === "unknown" || consent.settingsOpen);
  const ref = useRef<HTMLElement>(null);
  const reopened = useRef(false);

  useEffect(() => {
    if (!visible) return;
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    root.setAttribute(OPEN_ATTRIBUTE, "");
    const measure = (): void => root.style.setProperty(HEIGHT_PROPERTY, `${el.offsetHeight}px`);
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(el);
    return () => {
      observer?.disconnect();
      root.removeAttribute(OPEN_ATTRIBUTE);
      root.style.removeProperty(HEIGHT_PROPERTY);
    };
  }, [visible]);

  // Reopened from the footer: move focus into the banner, and give it back to the link afterwards.
  useEffect(() => {
    if (visible && consent.settingsOpen) {
      reopened.current = true;
      ref.current?.focus();
    } else if (!visible && reopened.current) {
      reopened.current = false;
      document.querySelector<HTMLElement>("[data-cookie-settings]")?.focus();
    }
  }, [visible, consent.settingsOpen]);

  if (!visible) return null;

  const current =
    consent.state === "accepted"
      ? "You have accepted analytics."
      : consent.state === "unknown"
        ? null
        : "You have rejected analytics.";

  return (
    <section ref={ref} className="bp-consent" aria-label="Analytics and cookies" tabIndex={-1}>
      <div className="bp-consent__text">
        <p>
          I&rsquo;d like to see how this site is used, with Google Analytics and Microsoft Clarity. They only
          load if you accept, and I keep advertising off. Details are on the{" "}
          <a href={privacyHref}>privacy page</a>.
        </p>
        {current ? <p className="bp-consent__current">{current}</p> : null}
      </div>
      <div className="bp-consent__actions">
        <Button type="button" variant="secondary" onClick={() => dispatchConsent("reject")}>
          Reject
        </Button>
        <Button type="button" variant="secondary" onClick={() => dispatchConsent("accept")}>
          Accept
        </Button>
        {consent.settingsOpen ? (
          <Button type="button" variant="ghost" onClick={closeConsentSettings}>
            Close
          </Button>
        ) : null}
      </div>
    </section>
  );
}
