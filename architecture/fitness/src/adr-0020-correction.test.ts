import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { realRepoRoot } from "./test-helpers.js";

// ADR-0020 said sign-in stores no name or email. It does: Neon Auth keeps them in the neon_auth schema. An accepted ADR is not edited, so the mistake is corrected in a dated
// section at its end, and the one place that repeated it (docs/data-sources.md) is fixed and links that section.
const adr = readFileSync(join(realRepoRoot, "architecture", "adr", "0020-sign-in-is-neon-auth-with-github-only.md"), "utf8");
const sources = readFileSync(join(realRepoRoot, "docs", "data-sources.md"), "utf8");

/** The anchor GitHub gives a heading: lower case, punctuation dropped, spaces to hyphens. */
const anchorOf = (heading: string): string => heading.toLowerCase().replace(/[^a-z0-9 -]/g, "").replace(/ /g, "-");

describe("the correction to ADR-0020", () => {
  const headings = [...adr.matchAll(/^## (.+)$/gm)].map((m) => m[1]!);

  it("is the last section, dated, and says what Neon Auth stores and that none of it is shown", () => {
    expect(headings.at(-1)).toBe("Correction, 2026-11-10");
    const correction = adr.slice(adr.lastIndexOf("## Correction, 2026-11-10"));
    expect(correction).toContain("stores the GitHub account's name and email, and the session record includes the IP address and browser, in the `neon_auth` schema");
    expect(correction).toContain("None of it is shown on the site.");
    expect(correction).toContain("The statement above that they are not stored was wrong.");
  });

  it("leaves the decision and its text as they were: the sentences it corrects are still there", () => {
    const original = adr.slice(0, adr.lastIndexOf("## Correction, 2026-11-10"));
    expect(original).toContain("Name, email and login are never stored or shown.");
    expect(original).toContain("nothing about sign-in lives in Bullpen's database apart from the user's id");
    expect(original).toContain("## Status\n\nAccepted");
    expect(original).toContain("Sign-in uses Neon's managed auth with GitHub as the only provider, and a player is only ever a neutral label.");
  });

  it("is linked from docs/data-sources.md, to a heading that exists, and the entry no longer says name and email are not stored", () => {
    const link = /\[correction in ADR-0020\]\(\.\.\/architecture\/adr\/0020-sign-in-is-neon-auth-with-github-only\.md#([^)]+)\)/.exec(sources);
    expect(link).not.toBeNull();
    expect(headings.map(anchorOf)).toContain(link![1]);
    expect(sources).not.toContain("Name, email and login are not stored or shown.");
    expect(sources).toContain("in the `neon_auth` schema of the same database");
  });
});
