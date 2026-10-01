"use client";

import type { ReactNode } from "react";
import { openConsentSettings } from "./consentStore.js";

/** The footer link that reopens the consent banner. A button, since it does something rather than go somewhere. */
export function CookieSettingsButton({ className }: { className?: string }): ReactNode {
  return (
    <button
      type="button"
      className={["bp-link-button", className].filter(Boolean).join(" ")}
      data-cookie-settings=""
      onClick={openConsentSettings}
    >
      Cookie settings
    </button>
  );
}
