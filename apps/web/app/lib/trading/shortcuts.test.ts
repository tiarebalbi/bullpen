import { describe, expect, it } from "vitest";
import { isTyping, shortcutFor } from "./shortcuts.js";

const press = (key: string, over: Partial<Parameters<typeof shortcutFor>[0]> = {}) => shortcutFor({ key, ctrlKey: false, metaKey: false, altKey: false, repeat: false, target: document.body, ...over });

describe("shortcuts", () => {
  it("B asks for the ticket, Esc for the cancel and ? for the list", () => {
    expect(press("b")).toBe("ticket");
    expect(press("B")).toBe("ticket");
    expect(press("Escape")).toBe("cancel");
    expect(press("?")).toBe("help");
    expect(press("x")).toBeNull();
  });
  it("none fires while typing in a field, Esc included", () => {
    for (const tag of ["input", "textarea", "select"]) {
      const field = document.createElement(tag);
      expect(isTyping(field)).toBe(true);
      for (const key of ["b", "Escape", "?"]) expect(press(key, { target: field })).toBeNull();
    }
    const editable = document.createElement("div");
    Object.defineProperty(editable, "isContentEditable", { value: true });
    expect(press("b", { target: editable })).toBeNull();
  });
  it("is not a shortcut with Ctrl, Cmd or Alt held, or on a held key", () => {
    expect(press("b", { ctrlKey: true })).toBeNull();
    expect(press("b", { metaKey: true })).toBeNull();
    expect(press("b", { altKey: true })).toBeNull();
    expect(press("b", { repeat: true })).toBeNull();
  });
  it("fires from a button, a link or the page itself", () => {
    expect(press("b", { target: document.createElement("button") })).toBe("ticket");
  });
});
