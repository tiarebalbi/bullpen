// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ArchPartData } from "../components/ui.js";
import { PLAY_MS, useSeriesPosition } from "./useSeriesPosition.js";
import { openingPosition } from "./seriesStops.js";

const part = (n: number, status: "built" | "planned"): ArchPartData => ({ part: n, status }) as unknown as ArchPartData;
const partsThrough = (built: number) => [1, 2, 3, 4, 5, 6].map((n) => part(n, n <= built ? "built" : "planned"));
const bonus = (status: "built" | "planned" = "built") => ({ ...part(4, status) });

describe("where the explorer opens", () => {
  it("opens on the bonus when the bonus is the current moment and built", () => {
    const { result } = renderHook(() => useSeriesPosition(partsThrough(4), bonus(), true));
    expect(result.current.bonusSelected).toBe(true);
    expect(result.current.part).toBe(4);
  });

  it("opens on Part 4 when the bonus is not the current moment", () => {
    const { result } = renderHook(() => useSeriesPosition(partsThrough(4), bonus(), false));
    expect(result.current.bonusSelected).toBe(false);
    expect(result.current.part).toBe(4);
  });

  it("opens on Part 5 again once Part 5 is published, the bonus no longer being the current moment", () => {
    // Fixture: Part 5 built, the timeline's current moment moved to part-05, so the flag is false.
    const { result } = renderHook(() => useSeriesPosition(partsThrough(5), bonus(), false));
    expect(result.current.bonusSelected).toBe(false);
    expect(result.current.part).toBe(5);
  });

  it("never opens on a bonus that is not built", () => {
    expect(openingPosition(partsThrough(4), bonus("planned"), true)).toBe(4);
    expect(openingPosition(partsThrough(4), null, true)).toBe(4);
    expect(openingPosition(partsThrough(4), bonus(), true)).toBe(4.5);
  });
});

describe("Play", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("stops on the bonus between Part 4 and Part 5 for the same interval as a part", () => {
    const { result } = renderHook(() => useSeriesPosition(partsThrough(6), bonus(), false));
    act(() => result.current.select(3));
    act(() => result.current.togglePlay());
    act(() => void vi.advanceTimersByTime(PLAY_MS));
    expect(result.current.part).toBe(4);
    expect(result.current.bonusSelected).toBe(false);
    act(() => void vi.advanceTimersByTime(PLAY_MS));
    expect(result.current.bonusSelected).toBe(true);
    expect(result.current.part).toBe(4);
    act(() => void vi.advanceTimersByTime(PLAY_MS - 1));
    expect(result.current.bonusSelected).toBe(true);
    act(() => void vi.advanceTimersByTime(1));
    expect(result.current.bonusSelected).toBe(false);
    expect(result.current.part).toBe(5);
  });

  it("runs to Part 6 and stops", () => {
    const { result } = renderHook(() => useSeriesPosition(partsThrough(6), bonus(), false));
    act(() => result.current.select(5));
    act(() => result.current.togglePlay());
    act(() => void vi.advanceTimersByTime(PLAY_MS));
    expect(result.current.part).toBe(6);
    expect(result.current.running).toBe(false);
  });

  it("starts again from Part 1 when played from the end", () => {
    const { result } = renderHook(() => useSeriesPosition(partsThrough(6), bonus(), false));
    act(() => result.current.select(6));
    act(() => result.current.togglePlay());
    expect(result.current.part).toBe(1);
    expect(result.current.running).toBe(true);
  });

  it("selecting the bonus stops Play", () => {
    const { result } = renderHook(() => useSeriesPosition(partsThrough(6), bonus(), false));
    act(() => result.current.togglePlay());
    act(() => result.current.selectBonus());
    expect(result.current.running).toBe(false);
    expect(result.current.bonusSelected).toBe(true);
  });
});
