import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { parseSeries } from "../lib/series.js";

const PRODUCTION_HOST = "bullpen.tiarebalbi.com";
const series = parseSeries(readFileSync(join(import.meta.dirname, "..", "..", "..", "content", "series.json"), "utf8"));

async function sitemapPaths(request: APIRequestContext): Promise<string[]> {
  const xml = await (await request.get("/sitemap.xml")).text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!).pathname);
}

const meta = (html: string, attr: "name" | "property", key: string): string | null =>
  html.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`))?.[1] ?? null;

function jsonLdGraphs(html: string): Array<{ "@graph": Array<Record<string, unknown>> }> {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]!));
}

async function canonicalAndOgUrls(request: APIRequestContext) {
  const urls: Array<{ path: string; canonical: string | undefined; ogUrl: string | null }> = [];
  for (const path of await sitemapPaths(request)) {
    const html = await (await request.get(path, { headers: { Host: PRODUCTION_HOST } })).text();
    urls.push({ path, canonical: html.match(/<link rel="canonical" href="([^"]+)"/)?.[1], ogUrl: meta(html, "property", "og:url") });
  }
  return urls;
}

const EXPECTED_TYPES: Record<string, string[]> = {
  "/": ["WebSite", "CreativeWorkSeries", "SoftwareSourceCode"],
  "/architecture": ["WebPage"],
  "/privacy": ["WebPage"],
};

test.describe("every page in the sitemap", () => {
  test("returns 200 with a title, description, canonical, og:image and twitter:image", async ({ request }) => {
    const paths = await sitemapPaths(request);
    expect(paths.sort()).toEqual(Object.keys(EXPECTED_TYPES).sort());

    for (const path of paths) {
      const res = await request.get(path, { headers: { Host: PRODUCTION_HOST } });
      expect(res.status(), path).toBe(200);
      const html = await res.text();
      expect(html.match(/<title>([^<]+)<\/title>/)?.[1], `${path} title`).toBeTruthy();
      expect(meta(html, "name", "description"), `${path} description`).toBeTruthy();
      expect(html.match(/<link rel="canonical" href="([^"]+)"/)?.[1], `${path} canonical`).toBeTruthy();
      expect(meta(html, "property", "og:image"), `${path} og:image`).toBeTruthy();
      expect(meta(html, "name", "twitter:image"), `${path} twitter:image`).toBeTruthy();
    }
  });

  test("serves its og:image and twitter:image as a 1200x630 PNG", async ({ request }) => {
    for (const path of await sitemapPaths(request)) {
      const html = await (await request.get(path, { headers: { Host: PRODUCTION_HOST } })).text();
      for (const url of [meta(html, "property", "og:image"), meta(html, "name", "twitter:image")]) {
        const image = await request.get(new URL(url!).pathname);
        expect(image.status(), `${path} ${url}`).toBe(200);
        expect(image.headers()["content-type"]).toBe("image/png");
        const png = await image.body();
        expect({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) }, `${path} ${url}`).toEqual({ width: 1200, height: 630 });
      }
    }
  });

  test("has an og:url equal to its canonical", async ({ request }) => {
    const urls = await canonicalAndOgUrls(request);
    expect(urls.filter((u) => u.canonical !== u.ogUrl)).toEqual([]);
  });

  test("ends the home page canonical and og:url in a slash", async ({ request }) => {
    const home = (await canonicalAndOgUrls(request)).find((u) => u.path === "/");
    expect(home).toEqual({ path: "/", canonical: `https://${PRODUCTION_HOST}/`, ogUrl: `https://${PRODUCTION_HOST}/` });
  });

  test("has exactly one JSON-LD block that parses, with the types listed for the page", async ({ request }) => {
    for (const [path, types] of Object.entries(EXPECTED_TYPES)) {
      const graphs = jsonLdGraphs(await (await request.get(path, { headers: { Host: PRODUCTION_HOST } })).text());
      expect(graphs, path).toHaveLength(1);
      expect(graphs[0]!["@graph"].map((node) => node["@type"]), path).toEqual(types);
    }
  });

  test("lists no series on /privacy", async ({ request }) => {
    const html = await (await request.get("/privacy", { headers: { Host: PRODUCTION_HOST } })).text();
    expect(JSON.stringify(jsonLdGraphs(html))).not.toContain("CreativeWorkSeries");
  });

  test("home hasPart headlines match content/series.json", async ({ request }) => {
    const [graph] = jsonLdGraphs(await (await request.get("/", { headers: { Host: PRODUCTION_HOST } })).text());
    const hasPart = graph!["@graph"].find((node) => node["@type"] === "CreativeWorkSeries")!.hasPart as Array<{ headline: string; url: string }>;
    // A published part with no date yet (the placeholder) is left out of hasPart: a BlogPosting needs the day it was published.
    const published = series.filter((p) => p.status === "published" && p.date !== null).sort((a, b) => a.part - b.part);
    expect(hasPart.map((p) => p.headline)).toEqual(published.map((p) => p.headline ?? p.title));
    expect(hasPart.map((p) => p.url)).toEqual(published.map((p) => p.url));
  });

  test("/architecture is part of the series and about Bullpen", async ({ request }) => {
    const [graph] = jsonLdGraphs(await (await request.get("/architecture", { headers: { Host: PRODUCTION_HOST } })).text());
    expect(graph!["@graph"][0]).toMatchObject({
      isPartOf: { "@type": "CreativeWorkSeries", name: "Architecting Software in 2026" },
      about: { name: "Bullpen" },
    });
  });
});
