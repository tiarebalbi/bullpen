const MIN_COOKIE_SECRET = 32;

type Env = Record<string, string | undefined>;

/**
 * What is wrong with the sign-in variables, as sentences that name the variable and never print its value. Empty when both are usable.
 * A preview has no sign-in by design (its address is not a trusted domain of the auth project), so it has nothing to report.
 */
export function authConfigIssues(env: Env = process.env): string[] {
  if (env.VERCEL_ENV === "preview") return [];
  const issues: string[] = [];
  const base = env.NEON_AUTH_BASE_URL;
  if (!base) issues.push("NEON_AUTH_BASE_URL is not set");
  else {
    try {
      if (new URL(base).protocol !== "https:") issues.push("NEON_AUTH_BASE_URL must be an https URL");
    } catch {
      issues.push("NEON_AUTH_BASE_URL is not a URL");
    }
  }
  const secret = env.NEON_AUTH_COOKIE_SECRET;
  if (!secret) issues.push("NEON_AUTH_COOKIE_SECRET is not set");
  else if (secret.length < MIN_COOKIE_SECRET) issues.push(`NEON_AUTH_COOKIE_SECRET is shorter than ${MIN_COOKIE_SECRET} characters`);
  return issues;
}
