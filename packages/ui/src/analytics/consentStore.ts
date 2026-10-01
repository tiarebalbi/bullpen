import {
  consentReducer,
  CONSENT_COOKIE,
  fromStored,
  readCookieValue,
  serializeConsentCookie,
  toStored,
  type ConsentAction,
  type ConsentState,
} from "./consent.js";

export interface ConsentSnapshot {
  /** False on the server and during hydration: nothing consent-dependent renders until the cookie has been read. */
  ready: boolean;
  state: ConsentState;
  /** True when "Cookie settings" reopened the banner after a choice was already made. */
  settingsOpen: boolean;
}

export const SERVER_CONSENT_SNAPSHOT: ConsentSnapshot = { ready: false, state: "unknown", settingsOpen: false };

let snapshot: ConsentSnapshot | null = null;
const listeners = new Set<() => void>();

function readStoredState(): ConsentState {
  try {
    return fromStored(readCookieValue(document.cookie, CONSENT_COOKIE));
  } catch {
    return "unknown";
  }
}

export function getConsentSnapshot(): ConsentSnapshot {
  if (!snapshot) snapshot = { ready: true, state: readStoredState(), settingsOpen: false };
  return snapshot;
}

export function getServerConsentSnapshot(): ConsentSnapshot {
  return SERVER_CONSENT_SNAPSHOT;
}

export function subscribeConsent(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function publish(next: ConsentSnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

function persist(state: ConsentState): void {
  const stored = toStored(state);
  if (!stored) return;
  try {
    // Secure wherever the page is https, which is everywhere it is deployed;
    // plain-http local servers would otherwise drop the cookie in some browsers.
    document.cookie = serializeConsentCookie(stored, { secure: window.location.protocol === "https:" });
  } catch {
    // Cookies blocked: the choice still holds for this page view.
  }
}

export function dispatchConsent(action: ConsentAction): void {
  const current = getConsentSnapshot();
  const state = consentReducer(current.state, action);
  persist(state);
  publish({ ready: true, state, settingsOpen: false });
}

export function openConsentSettings(): void {
  publish({ ...getConsentSnapshot(), settingsOpen: true });
}

export function closeConsentSettings(): void {
  publish({ ...getConsentSnapshot(), settingsOpen: false });
}

/** Test seam: forget the in-memory snapshot so the next read goes back to the cookie. */
export function resetConsentStoreForTests(): void {
  snapshot = null;
  listeners.clear();
}
