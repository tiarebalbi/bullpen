import type { ReactNode } from "react";
import { HandleForm, type OwnHandleView } from "./HandleForm.js";
import { PageFrame } from "./PageFrame.js";

/** The account page's content, in the terminal's frame. What the player is told is the same wherever it is drawn: the page, and the e2e fixture route. */
export function AccountScreen({ player, own, unavailable }: { player: { label: string } | null; own: OwnHandleView | null; unavailable: boolean }): ReactNode {
  return (
    <PageFrame title="Account">
      <div className="bp-page__body">
        <h2 className="bp-page__title">Your account</h2>
        <p className="bp-page__back"><a href="/">Back to the terminal</a></p>
        {!player ? (
          <p>Sign in with GitHub on the terminal to set a handle. Until you do, and until a handle is approved, you appear as “Player” and four characters.</p>
        ) : unavailable ? (
          <p role="alert">Handles are not available right now. Try again in a moment.</p>
        ) : (
          <HandleForm initial={own} label={player.label} />
        )}
      </div>
    </PageFrame>
  );
}
