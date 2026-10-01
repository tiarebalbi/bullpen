import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Analytics } from "./Analytics.js";
import { ConsentBanner } from "./ConsentBanner.js";
import { CookieSettingsButton } from "./CookieSettingsButton.js";
import type { AnalyticsConfig } from "./config.js";
import { CONSENT_COOKIE } from "./consent.js";
import { dispatchConsent, resetConsentStoreForTests } from "./consentStore.js";
import { GOOGLE_CONSENT_DENIED, GOOGLE_SCRIPT_ID } from "./google.js";
import { CLARITY_SCRIPT_ID } from "./clarity.js";
import { setTrackTransport, track } from "./track.js";

const CONFIG: AnalyticsConfig = { googleId: "G-TEST000000", clarityId: "clar1tytest" };

function wipe(): void {
  for (const id of [GOOGLE_SCRIPT_ID, CLARITY_SCRIPT_ID]) document.getElementById(id)?.remove();
  delete (window as unknown as Record<string, unknown>).dataLayer;
  delete (window as unknown as Record<string, unknown>).gtag;
  delete (window as unknown as Record<string, unknown>).clarity;
  for (const name of document.cookie.split(";").map((c) => c.split("=")[0]!.trim()).filter(Boolean)) {
    document.cookie = `${name}=; Max-Age=0; Path=/`;
  }
  setTrackTransport(null);
  resetConsentStoreForTests();
}

beforeEach(wipe);
afterEach(wipe);

const dataLayer = (): unknown[][] =>
  ((window as unknown as { dataLayer?: ArrayLike<unknown>[] }).dataLayer ?? []).map((entry) => Array.from(entry));

describe("tags load only with production config AND consent", () => {
  it("loads nothing outside production, with no ids (config is null), even after Accept", () => {
    render(<Analytics config={null} part={1} pathname="/" />);
    act(() => dispatchConsent("accept"));
    expect(document.getElementById(GOOGLE_SCRIPT_ID)).toBeNull();
    expect(document.getElementById(CLARITY_SCRIPT_ID)).toBeNull();
    expect(dataLayer()).toEqual([]);
  });

  it("loads nothing before the visitor chooses, or after Reject, and sets no cookie but its own", () => {
    render(<Analytics config={CONFIG} part={1} pathname="/" />);
    expect(document.getElementById(GOOGLE_SCRIPT_ID)).toBeNull();
    expect(document.getElementById(CLARITY_SCRIPT_ID)).toBeNull();
    act(() => dispatchConsent("reject"));
    expect(document.getElementById(GOOGLE_SCRIPT_ID)).toBeNull();
    expect(document.getElementById(CLARITY_SCRIPT_ID)).toBeNull();
    expect(dataLayer()).toEqual([]);
    expect(document.cookie).toBe(`${CONSENT_COOKIE}=rejected`);
  });

  it("loads only the tool whose id is set", () => {
    render(<Analytics config={{ googleId: null, clarityId: "clar1tytest" }} part={1} pathname="/" />);
    act(() => dispatchConsent("accept"));
    expect(document.getElementById(GOOGLE_SCRIPT_ID)).toBeNull();
    expect(document.getElementById(CLARITY_SCRIPT_ID)?.getAttribute("src")).toBe("https://www.clarity.ms/tag/clar1tytest");
  });

  it("loads both after Accept", () => {
    render(<Analytics config={CONFIG} part={1} pathname="/" />);
    act(() => dispatchConsent("accept"));
    expect(document.getElementById(GOOGLE_SCRIPT_ID)?.getAttribute("src")).toBe(
      "https://www.googletagmanager.com/gtag/js?id=G-TEST000000",
    );
    expect(document.getElementById(CLARITY_SCRIPT_ID)).not.toBeNull();
  });
});

describe("Google consent", () => {
  it("runs the default call (all four denied) before anything else, then only analytics_storage changes", () => {
    render(<Analytics config={CONFIG} part={1} pathname="/" />);
    act(() => dispatchConsent("accept"));
    const calls = dataLayer();
    expect(calls[0]).toEqual(["consent", "default", GOOGLE_CONSENT_DENIED]);
    expect(calls[1]).toEqual(["consent", "update", { analytics_storage: "granted" }]);
    const configAt = calls.findIndex((c) => c[0] === "config");
    expect(configAt).toBeGreaterThan(1);
    expect(calls[configAt]![2]).toMatchObject({ send_page_view: false, cookie_domain: "localhost" });
  });

  it("never grants an advertising signal in any call", () => {
    render(<Analytics config={CONFIG} part={1} pathname="/" />);
    act(() => dispatchConsent("accept"));
    for (const call of dataLayer()) {
      if (call[0] !== "consent") continue;
      const signals = call[2] as Record<string, string>;
      for (const key of ["ad_storage", "ad_user_data", "ad_personalization"]) {
        expect(signals[key] ?? "denied").toBe("denied");
      }
    }
  });

  it("has the default in the queue before the tag is added to the page", () => {
    const appended: number[] = [];
    const original = document.head.appendChild.bind(document.head);
    const spy = vi.spyOn(document.head, "appendChild").mockImplementation(((node: Node) => {
      if ((node as HTMLElement).id === GOOGLE_SCRIPT_ID) appended.push(dataLayer().length);
      return original(node);
    }) as typeof document.head.appendChild);
    render(<Analytics config={CONFIG} part={1} pathname="/" />);
    act(() => dispatchConsent("accept"));
    spy.mockRestore();
    expect(appended).toHaveLength(1);
    expect(appended[0]).toBeGreaterThanOrEqual(4);
  });
});

describe("Clarity consent and tag", () => {
  it("queues Consent API v2 (ads denied, analytics granted) and the part tag before the script", () => {
    render(<Analytics config={CONFIG} part={1} pathname="/" />);
    act(() => dispatchConsent("accept"));
    const queue = ((window as unknown as { clarity: { q: ArrayLike<unknown>[] } }).clarity.q).length
      ? Array.from((window as unknown as { clarity: { q: ArrayLike<unknown>[] } }).clarity.q).map((a) => Array.from(a))
      : [];
    expect(queue[0]).toEqual(["consentv2", { ad_Storage: "denied", analytics_Storage: "granted" }]);
    expect(queue[1]).toEqual(["set", "part", "1"]);
  });
});

describe("page views", () => {
  it("sends one page_view per pathname change, not one per render", () => {
    const { rerender } = render(<Analytics config={CONFIG} part={1} pathname="/" />);
    act(() => dispatchConsent("accept"));
    rerender(<Analytics config={CONFIG} part={1} pathname="/" />);
    rerender(<Analytics config={CONFIG} part={1} pathname="/privacy" />);
    const views = dataLayer().filter((c) => c[0] === "event" && c[1] === "page_view");
    expect(views.map((v) => (v[2] as { page_path: string }).page_path)).toEqual(["/", "/privacy"]);
  });
});

describe("track", () => {
  it("does nothing before consent, even with a transport set", () => {
    const transport = vi.fn();
    setTrackTransport(transport);
    track("adr_open", { adr_number: 2 });
    expect(transport).not.toHaveBeenCalled();
    act(() => dispatchConsent("reject"));
    track("adr_open", { adr_number: 2 });
    expect(transport).not.toHaveBeenCalled();
  });

  it("does nothing when the tag is not loaded, even with consent", () => {
    act(() => dispatchConsent("accept"));
    expect(() => track("adr_open", { adr_number: 2 })).not.toThrow();
  });

  it("sends the event once consent is given and the tag is loaded, and stops after withdrawal", () => {
    render(<Analytics config={CONFIG} part={1} pathname="/" reload={() => {}} />);
    act(() => dispatchConsent("accept"));
    track("series_part_click", { part_number: 1 });
    expect(dataLayer().some((c) => c[0] === "event" && c[1] === "series_part_click")).toBe(true);
    const before = dataLayer().length;
    act(() => dispatchConsent("withdraw"));
    track("series_part_click", { part_number: 1 });
    expect(dataLayer().filter((c) => c[1] === "series_part_click")).toHaveLength(1);
    expect(dataLayer().length).toBeGreaterThan(before); // the consent update to denied
  });
});

describe("withdrawing", () => {
  it("denies analytics_storage, erases Clarity, clears the cookies and reloads", () => {
    document.cookie = "_ga=GA1.1.1; Path=/";
    document.cookie = "_clck=abc; Path=/";
    const reload = vi.fn();
    render(<Analytics config={CONFIG} part={1} pathname="/" reload={reload} />);
    act(() => dispatchConsent("accept"));
    act(() => dispatchConsent("withdraw"));
    const calls = dataLayer();
    expect(calls.at(-1)).toEqual(["consent", "update", { analytics_storage: "denied" }]);
    const clarityQueue = Array.from((window as unknown as { clarity: { q: ArrayLike<unknown>[] } }).clarity.q).map((a) => Array.from(a));
    expect(clarityQueue.at(-1)).toEqual(["consent", false]);
    expect(document.cookie).not.toContain("_ga");
    expect(document.cookie).not.toContain("_clck");
    expect(document.cookie).toContain(`${CONSENT_COOKIE}=rejected`);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload a page where no tag ever ran", () => {
    const reload = vi.fn();
    render(<Analytics config={null} part={1} pathname="/" reload={reload} />);
    act(() => dispatchConsent("accept"));
    act(() => dispatchConsent("withdraw"));
    expect(reload).not.toHaveBeenCalled();
  });
});

describe("the banner", () => {
  it("shows to a first-time visitor, with Accept and Reject as the same kind of button and a privacy link", () => {
    render(<ConsentBanner privacyHref="/privacy" />);
    const accept = screen.getByRole("button", { name: "Accept" });
    const reject = screen.getByRole("button", { name: "Reject" });
    expect(accept.className).toBe(reject.className);
    expect(accept.getAttribute("style")).toBe(reject.getAttribute("style"));
    expect(screen.getByRole("link", { name: "privacy page" })).toHaveAttribute("href", "/privacy");
  });

  it("goes away once a choice is made, and the choice survives a remount (the cookie)", () => {
    const { unmount } = render(<ConsentBanner privacyHref="/privacy" />);
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(screen.queryByRole("region", { name: "Analytics and cookies" })).toBeNull();
    unmount();
    resetConsentStoreForTests();
    render(<ConsentBanner privacyHref="/privacy" />);
    expect(screen.queryByRole("region", { name: "Analytics and cookies" })).toBeNull();
  });

  it("reopens from Cookie settings with focus inside it, and Close gives focus back to the link", () => {
    dispatchConsent("accept");
    render(
      <>
        <ConsentBanner privacyHref="/privacy" />
        <CookieSettingsButton />
      </>,
    );
    expect(screen.queryByRole("region", { name: "Analytics and cookies" })).toBeNull();
    const link = screen.getByRole("button", { name: "Cookie settings" });
    fireEvent.click(link);
    const banner = screen.getByRole("region", { name: "Analytics and cookies" });
    expect(banner).toHaveFocus();
    expect(screen.getByText("You have accepted analytics.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(link).toHaveFocus();
  });

  it("reserves its height on the page while open, and lets go when it closes", () => {
    render(<ConsentBanner privacyHref="/privacy" />);
    expect(document.documentElement).toHaveAttribute("data-consent-open");
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(document.documentElement).not.toHaveAttribute("data-consent-open");
  });
});
