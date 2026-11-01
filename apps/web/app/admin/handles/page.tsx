import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { listReviewQueue } from "@bullpen/db-handles";
import { currentPlayer } from "../../lib/auth/player.js";
import { signInAvailable } from "../../lib/auth/server.js";
import { isHandleAdmin } from "../../lib/handles/admins.js";
import { handlesPool } from "../../lib/handles/pool.js";
import { ReviewList, type ReviewItem } from "../../components/ReviewList.js";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Handles in review — Bullpen", robots: { index: false } };

/** Only the allowlisted account sees this; anyone else gets the page a missing route gets. */
export default async function ReviewPage(): Promise<ReactNode> {
  const player = signInAvailable() ? await currentPlayer() : null;
  if (!isHandleAdmin(player?.userId)) notFound();
  const items = await listReviewQueue(handlesPool())
    .then((queue): ReviewItem[] => queue.map((item) => ({ ...item, enqueuedAt: item.enqueuedAt.toISOString() })))
    .catch(() => null);
  return (
    <main className="bp-app">
      <h1>Handles in review</h1>
      {items ? <ReviewList items={items} /> : <p role="alert">I cannot read the review queue right now.</p>}
    </main>
  );
}
