/** The rules a handle must meet before any model is asked. A failing rule is a form error: no call is made. */
export const HANDLE_MIN = 3;
export const HANDLE_MAX = 20;
export const HANDLE_PATTERN = /^[A-Za-z0-9_-]+$/;

export type HandleCheck = { ok: true; handle: string } | { ok: false; error: string };

/** Checks the text as typed (leading and trailing spaces are not part of a handle). Uniqueness, ignoring case, is the database's rule and is checked on save. */
export function checkHandle(input: unknown): HandleCheck {
  if (typeof input !== "string") return { ok: false, error: "Type a handle." };
  const handle = input.trim();
  if (handle.length < HANDLE_MIN || handle.length > HANDLE_MAX) return { ok: false, error: `A handle is ${HANDLE_MIN} to ${HANDLE_MAX} characters.` };
  if (!HANDLE_PATTERN.test(handle)) return { ok: false, error: "Use letters, digits, _ and - only." };
  return { ok: true, handle };
}
