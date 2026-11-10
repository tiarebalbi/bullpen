import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BONUS_OFFSET, PartScrubber, nextPosition, stateAt, type BonusStop } from "./PartScrubber.js";

const parts = [1, 2, 3, 4, 5, 6].map((part) => ({ part, title: `Title ${part}`, status: part <= 4 ? ("built" as const) : ("planned" as const) }));
const bonus: BonusStop = { after: 4, title: "Change request", status: "planned" };
const html = (props: Partial<Parameters<typeof PartScrubber>[0]> = {}) =>
  renderToStaticMarkup(<PartScrubber parts={parts} part={4} bonus={bonus} playing={false} onSelect={() => undefined} onSelectBonus={() => undefined} onTogglePlay={() => undefined} {...props} />);

describe("the scrubber's bonus node", () => {
  it("is a diamond on a branch labelled BONUS and 'Change request', reached straight after Part 4", () => {
    const markup = html();
    expect(markup).toContain('class="bp-ap-scrub__diamond"');
    expect(markup).toContain('class="bp-ap-scrub__stub"');
    expect(markup).toContain("BONUS · PLANNED");
    expect(markup).toContain(">Change request<");
    expect(markup.indexOf("Title 4")).toBeLessThan(markup.indexOf("BONUS ·"));
    expect(markup.indexOf("BONUS ·")).toBeLessThan(markup.indexOf("Title 5"));
  });

  it("is not on the main line: the six parts keep their six stops", () => {
    const markup = html();
    expect(markup.match(/class="bp-ap-scrub__stop"/g)).toHaveLength(6);
    expect(markup).toContain('data-has-bonus="true"');
  });

  it("draws no node when the series has no bonus", () => {
    const markup = html({ bonus: undefined });
    expect(markup).not.toContain("BONUS");
    expect(markup).not.toContain("bp-ap-scrub__diamond");
    expect(markup).not.toContain("data-has-bonus");
  });

  it("is planned until it is built, and says which", () => {
    expect(html()).toMatch(/bp-ap-scrub__bonus"[^>]*data-status="planned"/);
    const built = html({ bonus: { ...bonus, status: "built" } });
    expect(built).toMatch(/bp-ap-scrub__bonus"[^>]*data-status="built"/);
    expect(built).toContain("BONUS · BUILT");
  });

  it("is future before it, current when selected, and past after it, as a part node is", () => {
    expect(html({ part: 3 })).toMatch(/bp-ap-scrub__bonus"[^>]*data-state="future"/);
    const current = html({ part: 4, bonusSelected: true });
    expect(current).toMatch(/bp-ap-scrub__bonus"[^>]*data-state="current"[^>]*aria-current="step"/);
    expect(html({ part: 5 })).toMatch(/bp-ap-scrub__bonus"[^>]*data-state="past"/);
  });

  it("takes the current mark off Part 4 while the bonus is selected, and Part 4 is then past", () => {
    const markup = html({ part: 4, bonusSelected: true });
    expect(markup).toMatch(/bp-ap-scrub__stop"[^>]*data-state="past"[^>]*data-status="built"[^>]*><span[^>]*><\/span><span[^>]*>PART 4/);
    expect(markup).not.toMatch(/data-state="current"[^>]*data-status="built"/);
    expect(markup.match(/aria-current="step"/g)).toHaveLength(1);
  });

  it("puts the fill between Part 4 and Part 5 when the bonus is selected", () => {
    expect(html({ part: 4, bonusSelected: true })).toContain("scaleX(0.7)");
    expect(html({ part: 4 })).toContain("scaleX(0.6)");
  });
});

describe("the bonus's branch", () => {
  const built = { ...bonus, status: "built" as const };
  it("is not reached before the bonus", () => {
    expect(html({ part: 4, bonus: built })).not.toMatch(/bp-ap-scrub__bonus"[^>]*data-reached/);
    expect(html({ part: 3, bonus: built })).not.toMatch(/bp-ap-scrub__bonus"[^>]*data-reached/);
  });
  it("is reached when the bonus is selected, and stays reached past it", () => {
    expect(html({ part: 4, bonus: built, bonusSelected: true })).toMatch(/bp-ap-scrub__bonus"[^>]*data-reached="true"/);
    expect(html({ part: 5, bonus: built })).toMatch(/bp-ap-scrub__bonus"[^>]*data-reached="true"/);
  });
});

describe("the positions on the line", () => {
  it("compares a stop with the selection", () => {
    expect(stateAt(4, 4)).toBe("current");
    expect(stateAt(3, 4.5)).toBe("past");
    expect(stateAt(4 + BONUS_OFFSET, 4)).toBe("future");
  });

  it("steps through the parts with the bonus between 4 and 5, and stops at the ends", () => {
    expect(nextPosition(6, 4, bonus, 1)).toBe(4.5);
    expect(nextPosition(6, 4.5, bonus, 1)).toBe(5);
    expect(nextPosition(6, 5, bonus, -1)).toBe(4.5);
    expect(nextPosition(6, 4.5, bonus, -1)).toBe(4);
    expect(nextPosition(6, 6, bonus, 1)).toBe(6);
    expect(nextPosition(6, 1, bonus, -1)).toBe(1);
    expect(nextPosition(6, 4, undefined, 1)).toBe(5);
  });
});
