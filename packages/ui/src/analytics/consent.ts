/**
 * The visitor's analytics choice, as a small state machine.
 *
 *   unknown --accept--> accepted --withdraw/reject--> withdrawn
 *   unknown --reject--> rejected --accept--> accepted
 *   withdrawn --accept--> accepted
 *
 * `withdrawn` is `rejected` after scripts had already been allowed: the
 * difference matters because withdrawing has to undo something (cookies,
 * loaded tags), rejecting from `unknown` does not. Only the choice itself is
 * stored, as `accepted` or `rejected`; a withdrawal is stored as `rejected`.
 */
export type ConsentState = "unknown" | "accepted" | "rejected" | "withdrawn";
export type ConsentAction = "accept" | "reject" | "withdraw";
export type StoredConsent = "accepted" | "rejected";

export const CONSENT_COOKIE = "bullpen_consent";
/** About six months (183 days). */
export const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 183;

export function consentReducer(state: ConsentState, action: ConsentAction): ConsentState {
  switch (action) {
    case "accept":
      return "accepted";
    case "reject":
    case "withdraw":
      if (state === "accepted" || state === "withdrawn") return "withdrawn";
      return action === "reject" ? "rejected" : state;
  }
}

/** The only state in which a tag may load or an event may be sent. */
export function allowsAnalytics(state: ConsentState): boolean {
  return state === "accepted";
}

export function toStored(state: ConsentState): StoredConsent | null {
  if (state === "accepted") return "accepted";
  if (state === "rejected" || state === "withdrawn") return "rejected";
  return null;
}

export function fromStored(value: string | null | undefined): ConsentState {
  if (value === "accepted") return "accepted";
  if (value === "rejected") return "rejected";
  return "unknown";
}

export function readCookieValue(cookieHeader: string, name: string): string | null {
  for (const part of cookieHeader.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return null;
}

export function serializeConsentCookie(value: StoredConsent, options: { secure: boolean }): string {
  const parts = [`${CONSENT_COOKIE}=${value}`, `Max-Age=${CONSENT_MAX_AGE_SECONDS}`, "Path=/", "SameSite=Lax"];
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}
