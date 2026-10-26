import { PRODUCTION_WEB_ORIGIN } from "../../lib/webUrlGuard.js";

/**
 * The trading app's deployed origin. `NEXT_PUBLIC_*` env vars are inlined
 * at build time, so a value set on bullpen-landing's Vercel project is
 * baked into the page; the fallback is the production custom domain, used
 * when the variable is unset. A production build refuses any other origin
 * (next.config.ts and lib/webUrlGuard.ts, ADR-0026): leave the variable
 * unset in production, or set it to exactly that domain.
 */
export const BULLPEN_WEB_URL = process.env.NEXT_PUBLIC_BULLPEN_WEB_URL ?? PRODUCTION_WEB_ORIGIN;
