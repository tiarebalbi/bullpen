import { describe, expect, it } from "vitest";
import css from "./tokens.css?raw";

/**
 * WCAG contrast of the design system's own colours, computed from tokens.css (not eyeballed).
 * `--bp-stale` colours text (price cells, ticker badges, the market strip, watchlist prices), so it has to reach 4.5:1
 * against every surface text sits on, in light and dark. The token is fixed here once, not per component.
 */
function block(selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  if (start < 0) throw new Error(`no ${selector} block in tokens.css`);
  return css.slice(start, css.indexOf("\n}", start));
}

function token(scope: string, name: string): string {
  const match = new RegExp(`${name}:\\s*([^;]+);`).exec(block(scope));
  if (!match) throw new Error(`${name} is not declared in ${scope}`);
  return match[1]!.trim();
}

function linearRgb(value: string): [number, number, number] {
  const m = /^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(value);
  if (!m) throw new Error(`not an oklch() colour: ${value}`);
  const L = Number(m[1]) / 100, C = Number(m[2]), h = (Number(m[3]) * Math.PI) / 180;
  const a = C * Math.cos(h), b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp = (x: number): number => Math.max(0, Math.min(1, x));
  return [clamp(4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s), clamp(-1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s), clamp(-0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s)];
}
const luminance = ([r, g, b]: [number, number, number]): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;
export function contrast(foreground: string, background: string): number {
  const x = luminance(linearRgb(foreground)), y = luminance(linearRgb(background));
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Every surface text can sit on. A name that is a `var()` alias is resolved through its target. */
const SURFACES = ["--background", "--surface-elevated", "--surface-sunken", "--popover", "--bp-panel", "--bp-panel-2"];

describe.each([
  ["light", ":root"],
  ["dark", ".dark"],
])("%s mode", (_mode, scope) => {
  it("--bp-stale text reaches 4.5:1 on every surface", () => {
    const stale = token(scope, "--bp-stale");
    for (const surface of SURFACES) {
      expect(contrast(stale, token(scope, surface)), `${stale} on ${surface}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("stale stays dimmer than normal text, so it still reads as stale", () => {
    expect(contrast(token(scope, "--bp-stale"), token(scope, "--background"))).toBeLessThan(contrast(token(scope, "--foreground"), token(scope, "--background")));
  });
});

describe("the contrast helper", () => {
  it("is 21:1 for black on white and 1:1 for a colour on itself", () => {
    expect(contrast("oklch(0% 0 0)", "oklch(100% 0 0)")).toBeCloseTo(21, 0);
    expect(contrast("oklch(58% 0.012 238)", "oklch(58% 0.012 238)")).toBeCloseTo(1, 5);
  });

  it("catches the value this fix replaced: 58% on light panel-2 was under 4.5:1", () => {
    expect(contrast("oklch(58% 0.012 238)", token(":root", "--bp-panel-2"))).toBeLessThan(4.5);
    expect(contrast("oklch(55% 0.015 238)", token(".dark", "--bp-panel-2"))).toBeLessThan(4.5);
  });
});
