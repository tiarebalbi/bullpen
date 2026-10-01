import { describe, expect, it } from "vitest";
import {
  allowsAnalytics,
  consentReducer,
  CONSENT_COOKIE,
  CONSENT_MAX_AGE_SECONDS,
  fromStored,
  readCookieValue,
  serializeConsentCookie,
  toStored,
  type ConsentAction,
  type ConsentState,
} from "./consent.js";

const STATES: ConsentState[] = ["unknown", "accepted", "rejected", "withdrawn"];

describe("consent state machine", () => {
  it("starts unknown and moves to accepted or rejected on the first choice", () => {
    expect(consentReducer("unknown", "accept")).toBe("accepted");
    expect(consentReducer("unknown", "reject")).toBe("rejected");
  });

  it("withdraws only from accepted: that is the one move that has something to undo", () => {
    expect(consentReducer("accepted", "withdraw")).toBe("withdrawn");
    expect(consentReducer("accepted", "reject")).toBe("withdrawn");
    expect(consentReducer("unknown", "withdraw")).toBe("unknown");
    expect(consentReducer("rejected", "withdraw")).toBe("rejected");
  });

  it("lets a rejected or withdrawn visitor accept later, and keeps a rejection a rejection", () => {
    expect(consentReducer("rejected", "accept")).toBe("accepted");
    expect(consentReducer("withdrawn", "accept")).toBe("accepted");
    expect(consentReducer("rejected", "reject")).toBe("rejected");
    expect(consentReducer("withdrawn", "reject")).toBe("withdrawn");
  });

  it("allows analytics in exactly one state, whatever the history", () => {
    const actions: ConsentAction[] = ["accept", "reject", "withdraw"];
    for (const state of STATES) {
      expect(allowsAnalytics(state)).toBe(state === "accepted");
      for (const action of actions) {
        expect(allowsAnalytics(consentReducer(state, action))).toBe(action === "accept");
      }
    }
  });
});

describe("what is stored", () => {
  it("stores the choice, and a withdrawal as a rejection", () => {
    expect(toStored("accepted")).toBe("accepted");
    expect(toStored("rejected")).toBe("rejected");
    expect(toStored("withdrawn")).toBe("rejected");
    expect(toStored("unknown")).toBeNull();
  });

  it("reads anything that is not a recorded choice as unknown", () => {
    expect(fromStored("accepted")).toBe("accepted");
    expect(fromStored("rejected")).toBe("rejected");
    expect(fromStored("yes")).toBe("unknown");
    expect(fromStored(null)).toBe("unknown");
  });

  it("writes a first-party cookie that lasts six months, SameSite=Lax, Secure on https", () => {
    expect(CONSENT_MAX_AGE_SECONDS).toBeGreaterThanOrEqual(60 * 60 * 24 * 182);
    expect(CONSENT_MAX_AGE_SECONDS).toBeLessThanOrEqual(60 * 60 * 24 * 184);
    const secure = serializeConsentCookie("accepted", { secure: true });
    expect(secure).toContain(`${CONSENT_COOKIE}=accepted`);
    expect(secure).toContain(`Max-Age=${CONSENT_MAX_AGE_SECONDS}`);
    expect(secure).toContain("Path=/");
    expect(secure).toContain("SameSite=Lax");
    expect(secure).toContain("Secure");
    expect(serializeConsentCookie("rejected", { secure: false })).not.toContain("Secure");
  });

  it("finds its cookie among others", () => {
    expect(readCookieValue("a=1; bullpen_consent=rejected; _ga=GA1", CONSENT_COOKIE)).toBe("rejected");
    expect(readCookieValue("a=1", CONSENT_COOKIE)).toBeNull();
    expect(readCookieValue("xbullpen_consent=accepted", CONSENT_COOKIE)).toBeNull();
  });
});
