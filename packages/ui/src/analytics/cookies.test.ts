import { describe, expect, it } from "vitest";
import { clearAnalyticsCookies, domainsFor } from "./cookies.js";

function jar(initial: string) {
  const writes: string[] = [];
  return {
    writes,
    get cookie() {
      return initial;
    },
    set cookie(value: string) {
      writes.push(value);
    },
  };
}

describe("domainsFor", () => {
  it("lists the host and every parent with two labels or more", () => {
    expect(domainsFor("bullpen.tiarebalbi.com")).toEqual(["bullpen.tiarebalbi.com", "tiarebalbi.com"]);
  });
  it("leaves an IP or a single label alone", () => {
    expect(domainsFor("127.0.0.1")).toEqual(["127.0.0.1"]);
    expect(domainsFor("localhost")).toEqual(["localhost"]);
  });
});

describe("clearAnalyticsCookies", () => {
  it("expires GA4's cookies on the host only, never on a parent domain", () => {
    const j = jar("_ga=1; _ga_ABC123=2; other=3");
    clearAnalyticsCookies(j, "bullpen.tiarebalbi.com");
    const expired = j.writes.filter((w) => w.startsWith("_ga"));
    expect(expired.length).toBeGreaterThan(0);
    expect(expired.every((w) => w.includes("Max-Age=0"))).toBe(true);
    expect(expired.some((w) => w.includes("Domain=tiarebalbi.com"))).toBe(false);
    expect(expired.some((w) => w.includes("Domain=bullpen.tiarebalbi.com"))).toBe(true);
  });

  it("expires Clarity's two cookies on the host and each parent, and leaves everything else", () => {
    const j = jar("_clck=1; _clsk=2; bullpen_consent=accepted; theme=dark");
    clearAnalyticsCookies(j, "bullpen.tiarebalbi.com");
    expect(j.writes.some((w) => w.startsWith("_clck=") && w.includes("Domain=tiarebalbi.com"))).toBe(true);
    expect(j.writes.some((w) => w.startsWith("_clsk=") && w.includes("Domain=bullpen.tiarebalbi.com"))).toBe(true);
    expect(j.writes.some((w) => w.startsWith("bullpen_consent") || w.startsWith("theme"))).toBe(false);
  });
});
