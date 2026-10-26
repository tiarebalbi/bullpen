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
  /** The top rows of the ranking (at most 50), then the caller's own row when it is not among them. Never the whole ranking. */
  rows: LeaderboardEntry[];
  /** How many accounts are ranked in all. */
  total: number;
  /** ISO timestamp of the last successful refresh. */
  asOf: string;
  ageMs: number;
  stale: boolean;
  lastFailure: { at: string; error: string } | null;
}

/** One symbol's latest end-of-day price, as GET /api/stock-prices returns it. */
export interface StockPriceEntry {
  symbol: string;
  /** A decimal string. */
  price: string;
  /** ISO timestamp of the close the price belongs to. */
  asOf: string;
  /** Older than its expected cadence. */
  stale: boolean;
  /** The close stored just before this one, or null: a change is shown only when both exist. */
  previousClose: { price: string; asOf: string } | null;
}

export interface StockPriceSnapshot {
  rows: StockPriceEntry[];
}
