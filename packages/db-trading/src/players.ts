import { createHash } from "node:crypto";
import type { Pool } from "pg";

/** What a new player's account starts with, in play money: one named number, so it is changed in one place. */
export const STARTING_CASH = "100000";

/**
 * A neutral label for a player until handles exist: "Player 4F2A", from a hash of the user's id. It is not unique, so the account's handle
 * (which must be) takes more characters of the hash when a shorter one is taken. It names neither the player's sign-in login nor their name.
 */
export function neutralHandle(userId: string, length = 4): string {
  return `Player ${createHash("sha256").update(userId).digest("hex").slice(0, length).toUpperCase()}`;
}

export interface PlayerAccount {
  accountId: string;
  handle: string;
  created: boolean;
}

const MAX_HANDLE_HEX = 16;

const findOwned = async (pool: Pool, userId: string): Promise<{ account_id: string; handle: string } | undefined> =>
  (await pool.query<{ account_id: string; handle: string }>("SELECT account_id, handle FROM trading.accounts WHERE owner_user_id = $1", [userId])).rows[0];

/**
 * The account of a signed-in user, made on first sign-in and the same one every time after. Idempotent and safe under concurrent calls: the
 * owner is unique, and a handle taken by someone else makes the next one longer.
 */
export async function ensurePlayerAccount(pool: Pool, userId: string): Promise<PlayerAccount> {
  const existing = await findOwned(pool, userId);
  if (existing) return { accountId: existing.account_id, handle: existing.handle, created: false };

  for (let length = 4; length <= MAX_HANDLE_HEX; length += 1) {
    const handle = neutralHandle(userId, length);
    const inserted = await pool.query<{ account_id: string }>(
      "INSERT INTO trading.accounts (handle, buying_power, owner_user_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING account_id",
      [handle, STARTING_CASH, userId],
    );
    if (inserted.rows[0]) return { accountId: inserted.rows[0].account_id, handle, created: true };
    // Nothing inserted: either this user's account appeared meanwhile (the owner is unique) or the handle is taken. Look again before lengthening.
    const again = await findOwned(pool, userId);
    if (again) return { accountId: again.account_id, handle: again.handle, created: false };
  }
  throw new Error("no free handle for this player");
}
