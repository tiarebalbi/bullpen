/**
 * The people who may review handles: Neon Auth user ids, listed here in config and in no environment variable, so that a change is a reviewed commit. Empty means
 * nobody can: the admin page and its route answer 404. It holds my own account's id only, added by the owner (ADR-0027); an id is not a name, an email or a login.
 */
export const HANDLE_ADMIN_USER_IDS: readonly string[] = [];

export const isHandleAdmin = (userId: string | null | undefined, allowlist: readonly string[] = HANDLE_ADMIN_USER_IDS): boolean => typeof userId === "string" && userId.length > 0 && allowlist.includes(userId);
