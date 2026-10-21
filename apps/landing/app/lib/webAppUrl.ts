/**
 * The trading app's deployed origin. `NEXT_PUBLIC_*` env vars are inlined
 * at build time, so bullpen-landing's Vercel project needs this set to
 * point at bullpen-web's real URL; the fallback is its production domain,
 * used so local/CI builds without the env var configured still point
 * somewhere real.
 */
export const BULLPEN_WEB_URL = process.env.NEXT_PUBLIC_BULLPEN_WEB_URL ?? "https://bullpen-app.tiarebalbi.com";
