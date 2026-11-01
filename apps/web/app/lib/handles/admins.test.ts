import { describe, expect, it } from "vitest";
import { HANDLE_ADMIN_USER_IDS, isHandleAdmin } from "./admins.js";

describe("who may review handles", () => {
  it("is nobody until an id is listed", () => {
    expect(HANDLE_ADMIN_USER_IDS).toEqual([]);
    expect(isHandleAdmin("user-1")).toBe(false);
  });

  it("is exactly the listed ids", () => {
    expect(isHandleAdmin("user-1", ["user-1"])).toBe(true);
    expect(isHandleAdmin("user-2", ["user-1"])).toBe(false);
    expect(isHandleAdmin("USER-1", ["user-1"])).toBe(false);
  });

  it("is nobody when there is no signed-in player", () => {
    for (const id of [null, undefined, ""]) expect(isHandleAdmin(id, ["", "user-1"])).toBe(false);
  });
});
