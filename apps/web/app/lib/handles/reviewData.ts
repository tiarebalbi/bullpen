import { listReported, listReviewQueue, listStuckPending } from "@bullpen/db-handles";
import type { ReportedRow, ReviewItem, StuckRow } from "../../components/ReviewList.js";

/** What a list read gives, or null when it could not be read: the page says so in words, and never shows an empty list for a failure. */
const orNull = <From, To>(read: Promise<From[]>, show: (row: From) => To): Promise<To[] | null> => read.then((rows) => rows.map(show), () => null);

export interface ReviewData {
  queue: ReviewItem[] | null;
  stuck: StuckRow[] | null;
  reported: ReportedRow[] | null;
}

/** The three lists the review page shows: handles in review, handles stuck pending, and approved handles players reported. None carries a user id. */
export async function readReviewData(pool: () => Parameters<typeof listReviewQueue>[0]): Promise<ReviewData> {
  const [queue, stuck, reported] = await Promise.all([
    orNull(listReviewQueue(pool()), (item): ReviewItem => ({ ...item, enqueuedAt: item.enqueuedAt.toISOString() })),
    orNull(listStuckPending(pool()), (row): StuckRow => ({ handleId: row.handleId, handle: row.handle, submittedAt: row.submittedAt.toISOString() })),
    orNull(listReported(pool()), (row): ReportedRow => ({ handleId: row.handleId, handle: row.handle, reports: row.reports, firstReportedAt: row.firstReportedAt.toISOString() })),
  ]);
  return { queue, stuck, reported };
}
