// Fixture data for the account and review screens: made up, never a real handle or a real queue. The e2e fixture routes (app/e2e-fixtures, a 404 unless BULLPEN_E2E_FIXTURES=1)
// and the screenshots read it.
export const OWN_HANDLE = { handle: "bull_run", status: "review" as const };
export const OWN_LABEL = "Player 4F2A";
export const REVIEW_ITEMS = [
  { handleId: "h1", handle: "bullrun99", probability: 0.62, reason: "below-threshold", enqueuedAt: "2026-10-20T14:05:00.000Z" },
  { handleId: "h2", handle: "x_trader", probability: null, reason: "timeout", enqueuedAt: "2026-10-20T14:20:00.000Z" },
  { handleId: "h3", handle: "mr_market", probability: 0.88, reason: "below-threshold", enqueuedAt: "2026-10-20T14:31:00.000Z" },
];
/** Pending for 25 minutes, whenever it is read. */
export const stuckRows = (): { handleId: string; handle: string; submittedAt: string }[] => [{ handleId: "h4", handle: "slowpoke", submittedAt: new Date(Date.now() - 25 * 60_000).toISOString() }];
/** Approved handles other players reported (made up): a count and a first time, never who reported. */
export const REPORTED_ROWS = [
  { handleId: "h5", handle: "loud_bull", reports: 3, firstReportedAt: "2026-10-20T12:00:00.000Z" },
  { handleId: "h6", handle: "meme_lord", reports: 1, firstReportedAt: "2026-10-20T13:10:00.000Z" },
];
