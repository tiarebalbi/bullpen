/**
 * The only host this page should ever be indexed under. Every Vercel
 * preview/production `.vercel.app` alias must send noindex -- confirmed
 * with the same env-var-with-a-real-fallback pattern as
 * BULLPEN_LANDING_CUSTOM_ORIGIN (apps/web's CORS route) and
 * NEXT_PUBLIC_BULLPEN_WEB_URL (webAppUrl.ts).
 */
export const PRODUCTION_HOST = process.env.BULLPEN_LANDING_PRODUCTION_HOST ?? "bullpen.tiarebalbi.com";

/** Strips a port (e.g. "localhost:3000") before comparing, so a local dev/preview server host still resolves correctly. */
export function isProductionHost(host: string | null | undefined): boolean {
  if (!host) return false;
  return host.split(":")[0] === PRODUCTION_HOST;
}
