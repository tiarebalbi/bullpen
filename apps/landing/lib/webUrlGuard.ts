/**
 * The trading app's production origin: the fallback for `BULLPEN_WEB_URL` (app/lib/webAppUrl.ts) and the one origin a
 * production build accepts. Changing it is a decision (ADR-0026), and `check:arch` pins the same value.
 */
export const PRODUCTION_WEB_ORIGIN = "https://bullpen-app.tiarebalbi.com";

/** The Vercel variable the landing reads the trading app's address from. */
export const WEB_URL_VARIABLE = "NEXT_PUBLIC_BULLPEN_WEB_URL";

export type WebUrlVerdict = { ok: true } | { ok: false; message: string };

function originOf(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * Whether a landing build may link to `value` as the trading app. A production build (`VERCEL_ENV=production`) accepts only
 * `PRODUCTION_WEB_ORIGIN`; a preview or local build accepts any `https://` origin, so a preview can point at a preview app.
 * `NEXT_PUBLIC_` values are inlined at build time, so a wrong one ships silently unless the build refuses it.
 */
export function checkWebUrl(value: string, vercelEnv: string | undefined): WebUrlVerdict {
  const origin = originOf(value);
  if (vercelEnv === "production") {
    if (origin === PRODUCTION_WEB_ORIGIN) return { ok: true };
    return { ok: false, message: `${WEB_URL_VARIABLE} is ${JSON.stringify(value)}; a production build needs the origin ${PRODUCTION_WEB_ORIGIN} (or the variable unset).` };
  }
  if (origin !== null && origin.startsWith("https://")) return { ok: true };
  return { ok: false, message: `${WEB_URL_VARIABLE} is ${JSON.stringify(value)}; a preview or local build needs an https:// origin (or the variable unset).` };
}

/** Throws the verdict's message when the value is refused, so the build fails; `value` unset means the fallback, which is always accepted. */
export function assertWebUrl(value: string | undefined, vercelEnv: string | undefined): void {
  if (value === undefined) return;
  const verdict = checkWebUrl(value, vercelEnv);
  if (!verdict.ok) throw new Error(verdict.message);
}
