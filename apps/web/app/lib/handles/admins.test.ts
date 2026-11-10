import { describe, expect, it } from "vitest";
import { HANDLE_ADMIN_USER_IDS, isHandleAdmin } from "./admins.js";

describe("who may review handles", () => {
  const OWNER = "7c48c226-1a7d-4ae1-975f-a22a746a1b0a";

  it("lists the owner's account id and nobody else's, and the entry is an id, not an email", () => {
    expect(HANDLE_ADMIN_USER_IDS).toEqual([OWNER]);
    for (const id of HANDLE_ADMIN_USER_IDS) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("lets the owner's id in with the real list, and no other id", () => {
    expect(isHandleAdmin(OWNER)).toBe(true);
    for (const other of ["user-1", "7c48c226-1a7d-4ae1-975f-a22a746a1b0b", OWNER.toUpperCase(), `${OWNER} `, OWNER.slice(0, -1), "", null, undefined]) expect(isHandleAdmin(other)).toBe(false);
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
