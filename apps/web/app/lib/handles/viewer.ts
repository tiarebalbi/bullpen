import { readOwnHandle } from "@bullpen/db-handles";
import { findPlayerAccount } from "@bullpen/db-trading";
import type { LeaderboardViewer } from "@bullpen/contracts";
import { currentPlayer, type Player } from "../auth/player.js";
import { signInAvailable } from "../auth/server.js";
import { tradingPool } from "../trading/pool.js";
import { handlesPool } from "./pool.js";
import { logHandleFailure } from "./respond.js";

export interface ViewerDeps {
  signInAvailable(): boolean;
  currentPlayer(): Promise<Player | null>;
  findAccount(userId: string): Promise<{ accountId: string } | null>;
  readHandle(userId: string): Promise<{ handle: string; status: "pending" | "approved" | "review" | "rejected" | "revoked" } | null>;
}

const live: ViewerDeps = {
  signInAvailable,
  currentPlayer: () => currentPlayer(),
  findAccount: (userId) => findPlayerAccount(tradingPool(), userId),
  readHandle: (userId) => readOwnHandle(handlesPool(), userId),
};

/**
 * The signed-in caller of the leaderboard: their account, and where their own handle stands. It is read for the caller alone and never from anything a request
 * names, so another player or a visitor cannot ask for it. A handle's text goes into the answer only when it is approved, which is public on the ranking anyway;
 * for one that is pending, in review, rejected or revoked the answer is its status. No account, or a failure reading it, is no viewer: the ranking is still served. If only the handle
 * cannot be read, the caller is still known by their account (their row is marked) and their handle reads as none.
 */
export async function readViewer(deps: ViewerDeps = live): Promise<LeaderboardViewer | undefined> {
  if (!deps.signInAvailable()) return undefined;
  try {
    const player = await deps.currentPlayer();
    if (!player) return undefined;
    const account = await deps.findAccount(player.userId);
    if (!account) return undefined;
    let own: Awaited<ReturnType<ViewerDeps["readHandle"]>> = null;
    try {
      own = await deps.readHandle(player.userId);
    } catch (error) {
      logHandleFailure("leaderboard.viewer", error);
    }
    return { accountId: account.accountId, handle: own ? { status: own.status, approved: own.status === "approved" ? own.handle : null } : null };
  } catch (error) {
    logHandleFailure("leaderboard.viewer", error);
    return undefined;
  }
}
