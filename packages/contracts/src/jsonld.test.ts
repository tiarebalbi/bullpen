import { describe, expect, it } from "vitest";
import { validateJsonLd } from "./jsonld.js";

const VALID = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      name: "Bullpen",
      url: "https://bullpen.tiarebalbi.com/",
    },
    {
      "@type": "CreativeWorkSeries",
      name: "Architecting Software in 2026",
      inLanguage: "en",
      author: {
        "@type": "Person",
        name: "Tiarê Balbi",
        url: "https://tiarebalbi.com",
      },
    },
  ],
};

describe("validateJsonLd", () => {
  it("accepts a real WebSite + CreativeWorkSeries graph", () => {
    const result = validateJsonLd(VALID);
    expect(result.errors).toBeNull();
    expect(result.valid).toBe(true);
  });

  it("rejects a graph missing the WebSite node", () => {
    const result = validateJsonLd({ "@context": "https://schema.org", "@graph": [VALID["@graph"][1]] });
    expect(result.valid).toBe(false);
  });

  it("rejects a graph missing the series author", () => {
    const seriesWithoutAuthor = { ...VALID["@graph"][1] } as Record<string, unknown>;
    delete seriesWithoutAuthor.author;
    const result = validateJsonLd({ "@context": "https://schema.org", "@graph": [VALID["@graph"][0], seriesWithoutAuthor] });
    expect(result.valid).toBe(false);
  });

  it("rejects the wrong @context", () => {
    const result = validateJsonLd({ ...VALID, "@context": "http://schema.org" });
    expect(result.valid).toBe(false);
  });
});
