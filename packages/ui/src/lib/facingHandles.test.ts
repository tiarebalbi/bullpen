import { describe, expect, it } from "vitest";
import { facingHandles } from "./facingHandles.js";

const at = (x: number, y: number): { x: number; y: number } => ({ x, y });

describe("facingHandles", () => {
  it("joins side to side when the nodes sit more across than down, right to left going right", () => {
    expect(facingHandles(at(0, 0), at(300, 100), false)).toEqual({ sourceHandle: "s-right", targetHandle: "t-left" });
    expect(facingHandles(at(300, 0), at(0, 100), false)).toEqual({ sourceHandle: "s-left", targetHandle: "t-right" });
  });

  it("joins top to bottom when the nodes sit more down than across", () => {
    expect(facingHandles(at(0, 0), at(40, 300), false)).toEqual({ sourceHandle: "s-bottom", targetHandle: "t-top" });
    expect(facingHandles(at(0, 300), at(0, 0), false)).toEqual({ sourceHandle: "s-top", targetHandle: "t-bottom" });
  });

  it("keeps the two sides for a step that follows the line backwards, and swaps source and target", () => {
    expect(facingHandles(at(0, 0), at(300, 0), true)).toEqual({ sourceHandle: "s-left", targetHandle: "t-right" });
  });

  it("says nothing for a node it cannot find", () => {
    expect(facingHandles(undefined, at(0, 0), false)).toEqual({});
  });
});
