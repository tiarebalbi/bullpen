import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { STUCK_AFTER_MINUTES, listReviewQueue, listStuckPending } from "@bullpen/db-handles";
import { currentPlayer } from "../../lib/auth/player.js";
import { signInAvailable } from "../../lib/auth/server.js";
import { isHandleAdmin } from "../../lib/handles/admins.js";
import { handlesPool } from "../../lib/handles/pool.js";
import type { ReviewItem, StuckRow } from "../../components/ReviewList.js";
import { ReviewScreen } from "../../components/ReviewScreen.js";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Handles in review — Bullpen", robots: { index: false } };

/** Only the allowlisted account sees this; anyone else gets the page a missing route gets. */
export default async function ReviewPage(): Promise<ReactNode> {
  const player = signInAvailable() ? await currentPlayer() : null;
  if (!isHandleAdmin(player?.userId)) notFound();
  const pool = handlesPool;
  const items = await listReviewQueue(pool())
    .then((queue): ReviewItem[] => queue.map((item) => ({ ...item, enqueuedAt: item.enqueuedAt.toISOString() })))
    .catch(() => null);
  const stuck = await listStuckPending(pool())
    .then((rows): StuckRow[] => rows.map((row) => ({ handleId: row.handleId, handle: row.handle, submittedAt: row.submittedAt.toISOString() })))
    .catch(() => null);
  return <ReviewScreen queue={items} stuck={stuck} stuckAfterMinutes={STUCK_AFTER_MINUTES} />;
}
