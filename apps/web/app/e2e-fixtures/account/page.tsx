import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AccountScreen } from "../../components/AccountScreen.js";
import { OWN_HANDLE, OWN_LABEL } from "../../../e2e/polishFixture.js";

// The account screen with made-up data, for the e2e specs and the screenshots. A 404 unless BULLPEN_E2E_FIXTURES=1, which only the e2e server sets.
export const dynamic = "force-dynamic";
export default function Page(): ReactNode {
  if (process.env.BULLPEN_E2E_FIXTURES !== "1") notFound();
  return <AccountScreen player={{ label: OWN_LABEL }} own={OWN_HANDLE} unavailable={false} />;
}
