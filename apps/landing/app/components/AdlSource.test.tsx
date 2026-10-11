import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { loadAdl, type AdlToken } from "../../lib/adl.js";
import { ADL_TOKEN_CLASS, AdlLineText, AdlSource, AdlTokens } from "./AdlSource.js";

const landingRoot = join(import.meta.dirname, "..", "..");
const adl = loadAdl(join(landingRoot, ".generated", "adl.json"));
const css = readFileSync(join(landingRoot, "app", "landing.css"), "utf8");

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#x27;": "'" };
/** The text a browser would show for `markup`: tags dropped, entities decoded. */
const textOf = (markup: string): string => markup.replace(/<[^>]+>/g, "").replace(/&(?:amp|lt|gt|quot|#x27);/g, (entity) => ENTITIES[entity]!);

/** One token of each kind, so every class is exercised whatever the file happens to say today. */
const ONE_OF_EACH: AdlToken[] = [
  { text: "ASSERT", kind: "keyword" },
  { text: "(", kind: "text" },
  { text: "Trading App", kind: "name" },
  { text: " ", kind: "text" },
  { text: "apps/web", kind: "path" },
  { text: ") # why", kind: "comment" },
];

describe("the highlighter's token classes", () => {
  it("gives each kind of token its own class, and wraps nothing else", () => {
    const markup = renderToStaticMarkup(<AdlTokens tokens={ONE_OF_EACH} />);
    expect(markup).toContain('<span class="bp-adl__keyword" data-token="keyword">ASSERT</span>');
    expect(markup).toContain('<span class="bp-adl__name" data-token="name">Trading App</span>');
    expect(markup).toContain('<span class="bp-adl__path" data-token="path">apps/web</span>');
    expect(markup).toContain('<span class="bp-adl__comment" data-token="comment">) # why</span>');
    expect(markup).toContain('<span class="bp-adl__text" data-token="text">(</span>');
    expect(Object.values(ADL_TOKEN_CLASS)).toEqual(["bp-adl__keyword", "bp-adl__name", "bp-adl__path", "bp-adl__comment", "bp-adl__text"]);
  });

  it("leaves the text of every line of the real file exactly as written, whatever it colours", () => {
    for (const line of adl.lines) expect(textOf(renderToStaticMarkup(<AdlLineText line={line} />)), `line ${line.number}`).toBe(line.raw);
    const whole = renderToStaticMarkup(<AdlSource lines={adl.lines} />);
    expect(textOf(whole)).toBe(adl.lines.map((line) => line.raw).join(""));
  });

  it("colours the file's own keywords, names, paths and comments, and nothing it did not classify", () => {
    const markup = renderToStaticMarkup(<AdlSource lines={adl.lines} />);
    const spans = (kind: string) => [...markup.matchAll(new RegExp(`data-token="${kind}">([^<]*)</span>`, "g"))].map((match) => match[1]);
    expect(spans("keyword")).toEqual(expect.arrayContaining(["DESCRIPTION", "CATEGORY", "DEFINE", "SYSTEM", "COMPONENT", "LIBRARY", "AS", "ASSERT", "DEFINED", "IS DEPENDENT ON", "HAS NO DEPENDENCY ON", "ONLY THROUGH", "ONLY", "READS"]));
    expect(spans("name")).toEqual(expect.arrayContaining(["Landing", "Trading App", "UI", "Contracts"]));
    // The secret's name comes from the rule that states it, so this file never spells it.
    const secret = /^ONLY \S+ READS (\S+)$/.exec(adl.rules.find((rule) => rule.text.includes(" READS "))!.text)![1]!;
    expect(spans("path")).toEqual(expect.arrayContaining(["apps/landing", "packages/ui", "apps/web/app/api/price", secret]));
    expect(spans("comment")).toEqual(adl.lines.filter((line) => line.kind === "comment").map((line) => line.raw.trim()));
  });

  it("hangs a wrapped line under its own text: the indent it was written with goes to the line's style", () => {
    const define = adl.lines.find((line) => line.raw.startsWith("  DEFINE COMPONENT Landing"))!;
    const assert = adl.lines.find((line) => line.kind === "assert")!;
    expect(renderToStaticMarkup(<AdlLineText line={define} />)).toContain("--indent:2");
    expect(renderToStaticMarkup(<AdlLineText line={assert} />)).toContain("--indent:0");
  });
});

describe("the highlighter's colours, in landing.css", () => {
  /** The declarations of the rule for `selector`, as a map. */
  function declarations(selector: string): Record<string, string> {
    const match = new RegExp(`${selector.replace(/[.]/g, "\\.")}\\s*\\{([^}]*)\\}`).exec(css);
    if (!match) throw new Error(`landing.css has no rule for ${selector}`);
    return Object.fromEntries(
      match[1]!
        .split(";")
        .map((declaration) => declaration.trim())
        .filter(Boolean)
        .map((declaration) => {
          const colon = declaration.indexOf(":");
          return [declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim()];
        }),
    );
  }

  it("draws keywords in the accent colour", () => {
    expect(declarations(".bp-adl__keyword").color).toBe("var(--bp-accent-text)");
  });

  it("draws names in primary text", () => {
    expect(declarations(".bp-adl__name").color).toBe("var(--foreground)");
  });

  it("draws paths and identifiers in muted monospace", () => {
    const path = declarations(".bp-adl__path");
    expect(path.color).toBe("var(--foreground-muted)");
    expect(path["font-family"]).toBe("var(--font-mono)");
    expect(declarations(".bp-adl")["font"]).toContain("var(--font-mono)");
  });

  it("draws # comments in muted italic", () => {
    const comment = declarations(".bp-adl__comment");
    expect(comment.color).toBe("var(--foreground-muted)");
    expect(comment["font-style"]).toBe("italic");
  });

  it("uses only the design system's tokens: no colour of its own anywhere in the highlighter's rules", () => {
    const highlighter = css.slice(css.indexOf("/* structure.adl, highlighted"), css.indexOf(".bp-adl-modal__file .bp-adl__row"));
    expect(highlighter.length).toBeGreaterThan(500);
    expect(highlighter).not.toMatch(/#[0-9a-fA-F]{3,8}\b|oklch\(|rgba?\(|hsla?\(/);
    for (const token of ["--bp-accent-text", "--foreground", "--foreground-muted", "--font-mono"]) expect(css + readFileSync(join(landingRoot, "..", "..", "packages", "ui", "src", "tokens.css"), "utf8")).toContain(`${token}:`);
  });

  it("wraps with a hanging indent and never lets a line scroll sideways", () => {
    const line = declarations(".bp-adl__line");
    expect(line["white-space"]).toBe("pre-wrap");
    expect(line["overflow-wrap"]).toBe("anywhere");
    expect(line["text-indent"]).toContain("var(--indent, 0)");
    expect(line["padding-left"]).toContain("var(--indent, 0)");
  });
});
