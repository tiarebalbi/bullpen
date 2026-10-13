/** One ranked account, as the leaderboard route returns it. Money is a decimal string: it never passes through a float. */
export interface LeaderboardEntry {
  accountId: string;
  handle: string;
  cash: string;
  positionsValue: string;
  equity: string;
  rank: number;
}

/**
 * GET /api/leaderboard: the current ranking and when it was computed. A
 * stale view still returns its ranking, with `stale` true and the age; a failed
 * refresh leaves the last good ranking and says so in `lastFailure`.
 */
export interface LeaderboardSnapshot {
  rows: LeaderboardEntry[];
  /** ISO timestamp of the last successful refresh. */
  asOf: string;
  ageMs: number;
  stale: boolean;
  lastFailure: { at: string; error: string } | null;
}
