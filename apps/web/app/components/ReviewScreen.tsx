import type { ReactNode } from "react";
import { PageFrame } from "./PageFrame.js";
import { ReviewList, type ReportedRow, type ReviewItem, type StuckRow } from "./ReviewList.js";

/** The review page's content, in the terminal's frame. Only the page's own gate decides who gets here: a missing queue is said in words, never an empty list. */
export function ReviewScreen({ queue, stuck, reported, stuckAfterMinutes }: { queue: ReviewItem[] | null; stuck: StuckRow[] | null; reported: ReportedRow[] | null; stuckAfterMinutes: number }): ReactNode {
  return (
    <PageFrame title="Handle review">
      <div className="bp-page__body">
        <h2 className="bp-page__title">Handles in review</h2>
        {queue && stuck && reported ? <ReviewList items={queue} stuck={stuck} reported={reported} stuckAfterMinutes={stuckAfterMinutes} /> : <p role="alert">I cannot read the review queue right now.</p>}
      </div>
    </PageFrame>
  );
}
