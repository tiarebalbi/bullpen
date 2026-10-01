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

describe("validateJsonLd: the published parts of the series", () => {
  const post = { "@type": "BlogPosting", headline: "Why distribute at all", url: "https://tiarebalbi.com/en/blog/a-post", datePublished: "2026-10-04" };
  const withParts = (hasPart: unknown) => ({
    "@context": "https://schema.org",
    "@graph": [VALID["@graph"][0], { ...VALID["@graph"][1], hasPart }],
  });

  it("accepts a series with its published parts", () => {
    expect(validateJsonLd(withParts([post, { ...post, headline: "Architecture as code", datePublished: "2026-10-11" }])).valid).toBe(true);
  });

  it("still accepts a series with none published, as long as it says nothing about parts", () => {
    expect(validateJsonLd(VALID).valid).toBe(true);
  });

  it("rejects an empty hasPart: a series with no parts leaves the property out", () => {
    expect(validateJsonLd(withParts([])).valid).toBe(false);
  });

  it("rejects a part with no headline, no url, a non-https url or a date that is not a date", () => {
    for (const broken of [{ ...post, headline: "" }, { ...post, url: undefined }, { ...post, url: "http://tiarebalbi.com/x" }, { ...post, datePublished: "October 4" }, { ...post, datePublished: undefined }]) {
      expect(validateJsonLd(withParts([broken])).valid, JSON.stringify(broken)).toBe(false);
    }
  });

  it("rejects a part that is not a BlogPosting", () => {
    expect(validateJsonLd(withParts([{ ...post, "@type": "Thing" }])).valid).toBe(false);
  });
});
