import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ReviewScreen } from "../../components/ReviewScreen.js";
import { REVIEW_ITEMS, stuckRows } from "../../../e2e/polishFixture.js";

// The review screen with a made-up queue, never a real one, for the e2e specs and the screenshots. A 404 unless BULLPEN_E2E_FIXTURES=1, which only the e2e server sets.
export const dynamic = "force-dynamic";
export default function Page(): ReactNode {
  if (process.env.BULLPEN_E2E_FIXTURES !== "1") notFound();
  return <ReviewScreen queue={REVIEW_ITEMS} stuck={stuckRows()} stuckAfterMinutes={10} />;
}
