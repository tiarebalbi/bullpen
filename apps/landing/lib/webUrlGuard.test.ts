import { describe, expect, it } from "vitest";
import { PRODUCTION_WEB_ORIGIN, assertWebUrl, checkWebUrl } from "./webUrlGuard.js";

describe("checkWebUrl", () => {
  it("accepts the custom domain in a production build, with or without a path", () => {
    expect(checkWebUrl(PRODUCTION_WEB_ORIGIN, "production")).toEqual({ ok: true });
    expect(checkWebUrl(`${PRODUCTION_WEB_ORIGIN}/`, "production")).toEqual({ ok: true });
  });

  it("refuses any other origin in a production build, naming the variable and the value it found", () => {
    for (const stale of ["https://bullpen-web-git-old-tiare-balbis-projects.vercel.app", "http://bullpen-app.tiarebalbi.com", "https://bullpen-app.tiarebalbi.com.evil.test", "not a url", ""]) {
      const verdict = checkWebUrl(stale, "production");
      expect(verdict.ok).toBe(false);
      if (!verdict.ok) {
        expect(verdict.message).toContain("NEXT_PUBLIC_BULLPEN_WEB_URL");
        expect(verdict.message).toContain(JSON.stringify(stale));
        expect(verdict.message).toContain(PRODUCTION_WEB_ORIGIN);
      }
    }
  });

  it("lets a preview or local build point at any https:// origin, so a preview can use a preview app", () => {
    for (const env of ["preview", "development", undefined]) {
      expect(checkWebUrl("https://bullpen-web-git-feature-tiare-balbis-projects.vercel.app", env)).toEqual({ ok: true });
      expect(checkWebUrl(PRODUCTION_WEB_ORIGIN, env)).toEqual({ ok: true });
    }
  });

  it("refuses a value that is not an https:// origin outside production too", () => {
    for (const env of ["preview", undefined]) {
      expect(checkWebUrl("http://localhost:3001", env).ok).toBe(false);
      expect(checkWebUrl("not a url", env).ok).toBe(false);
    }
  });
});

describe("assertWebUrl", () => {
  it("accepts an unset variable in every environment, because the fallback is the production origin", () => {
    for (const env of ["production", "preview", undefined]) expect(() => assertWebUrl(undefined, env)).not.toThrow();
  });

  it("throws the message for a refused value, so the build fails", () => {
    expect(() => assertWebUrl("https://bullpen-web-git-old-tiare-balbis-projects.vercel.app", "production")).toThrow(/NEXT_PUBLIC_BULLPEN_WEB_URL is "https:\/\/bullpen-web-git-old-tiare-balbis-projects\.vercel\.app"/);
    expect(() => assertWebUrl("https://bullpen-web-git-old-tiare-balbis-projects.vercel.app", "preview")).not.toThrow();
  });
});
