import { createHash, timingSafeEqual } from "node:crypto";

export type SweepAuth = "ok" | "unauthorized" | "not-configured";

const digest = (value: string): Buffer => createHash("sha256").update(value).digest();

/**
 * Whether a request may run the sweep: a bearer token equal to SWEEP_SECRET, compared in constant time. Only this
 * directory reads the variable, and nothing here prints it. With no secret configured nobody may run the sweep.
 */
export function authorizeSweep(request: Request): SweepAuth {
  const secret = process.env.SWEEP_SECRET;
  if (!secret) return "not-configured";
  const header = request.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  return timingSafeEqual(digest(given), digest(secret)) ? "ok" : "unauthorized";
}
