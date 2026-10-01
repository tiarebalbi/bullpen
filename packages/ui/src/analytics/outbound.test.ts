import { describe, expect, it } from "vitest";
import { outboundHost } from "./outbound.js";

describe("outboundHost", () => {
  const here = "bullpen.tiarebalbi.com";
  it("returns only the host of a link to another site", () => {
    expect(outboundHost("https://tiarebalbi.com/en/blog/post?utm=x#top", here)).toBe("tiarebalbi.com");
    expect(outboundHost("https://bullpen-web-nine.vercel.app/", here)).toBe("bullpen-web-nine.vercel.app");
  });
  it("is null for the same site, relative links, fragments and non-web schemes", () => {
    expect(outboundHost("https://bullpen.tiarebalbi.com/privacy", here)).toBeNull();
    expect(outboundHost("/privacy", here)).toBeNull();
    expect(outboundHost("#series", here)).toBeNull();
    expect(outboundHost("mailto:someone@example.com", here)).toBeNull();
  });
});
