import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { lineAt } from "./source-scan.js";
import type { Violation } from "./violation.js";

const CHECK = "web url";
const VARIABLE = "NEXT_PUBLIC_BULLPEN_WEB_URL";
/** The one origin a production landing build may link to. ADR-0026 records it; changing it is a new ADR. */
export const PRODUCTION_WEB_ORIGIN = "https://bullpen-app.tiarebalbi.com";

/** Recorded in ADR-0026 (there is no ADL line for it: it is about a value Vercel bakes into a build). */
export const WEB_URL_RULE = `a production landing build links to the trading app only at ${PRODUCTION_WEB_ORIGIN}`;

const GUARD_FILE = "apps/landing/lib/webUrlGuard.ts";
const FALLBACK_FILE = "apps/landing/app/lib/webAppUrl.ts";
const CONFIG_FILE = "apps/landing/next.config.ts";
const WHY = "A NEXT_PUBLIC_ value is inlined at build time, so a stale trading-app address shipped silently in production (ADR-0026).";

function violation(where: string, why: string, fix: string): Violation {
  return { check: CHECK, rule: WEB_URL_RULE, where, why, fix };
}

function read(repoRoot: string, path: string): string | null {
  const absolute = join(repoRoot, path);
  return existsSync(absolute) ? readFileSync(absolute, "utf8") : null;
}

function originOf(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/** Tracked files that can set an environment variable for a build: `.env*`, vercel.json, CI workflows and package scripts. */
function listConfigFiles(repoRoot: string): string[] {
  let output: string;
  try {
    output = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return [];
  }
  return output.split("\0").filter((path) => {
    const name = basename(path);
    return name.startsWith(".env") || name === "vercel.json" || name === "package.json" || path.startsWith(".github/workflows/");
  });
}

/**
 * The landing's link to the trading app, held to one origin in production. Four things must hold: the guard states the origin the
 * ADR decided, the landing's build config calls the guard, the fallback is that origin and not a second copy of it, and no tracked
 * config sets the variable to another origin. When `env` is a production build's (`VERCEL_ENV=production`), its value is checked
 * too, so running `check:arch` inside that build refuses a stale one with the same rule.
 */
export function checkWebUrl(repoRoot: string, env: NodeJS.ProcessEnv = process.env): Violation[] {
  const violations: Violation[] = [];

  const guard = read(repoRoot, GUARD_FILE);
  const declared = guard?.match(/export const PRODUCTION_WEB_ORIGIN = "([^"]*)"/)?.[1];
  if (declared !== PRODUCTION_WEB_ORIGIN) {
    violations.push(violation(GUARD_FILE, `The guard ${declared === undefined ? "does not export PRODUCTION_WEB_ORIGIN" : `names ${declared} as the production origin`}, not ${PRODUCTION_WEB_ORIGIN} (ADR-0026).`, `Export PRODUCTION_WEB_ORIGIN = "${PRODUCTION_WEB_ORIGIN}" from ${GUARD_FILE}, or record a new origin in a new ADR.`));
  }

  const config = read(repoRoot, CONFIG_FILE);
  if (config === null || !/\bassertWebUrl\(/.test(config.replace(/\/\/.*$/gm, ""))) {
    violations.push(violation(CONFIG_FILE, `The landing's build config does not call assertWebUrl, so a production build would accept any trading-app address (ADR-0026).`, `Call assertWebUrl(process.env.${VARIABLE}, process.env.VERCEL_ENV) at the top of ${CONFIG_FILE}.`));
  }

  const fallback = read(repoRoot, FALLBACK_FILE);
  if (fallback === null || !/\?\?\s*PRODUCTION_WEB_ORIGIN\b/.test(fallback) || /https?:\/\//.test(fallback.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""))) {
    violations.push(violation(FALLBACK_FILE, `The fallback is not the shared PRODUCTION_WEB_ORIGIN constant, so the guard and the link could drift apart (ADR-0026).`, `Use \`process.env.${VARIABLE} ?? PRODUCTION_WEB_ORIGIN\` and no URL literal in ${FALLBACK_FILE}.`));
  }

  const setting = new RegExp(`${VARIABLE}\\s*[=:]\\s*["']?(https?://[^\\s"'\`,}]+)`, "g");
  for (const path of listConfigFiles(repoRoot)) {
    const text = read(repoRoot, path);
    if (text === null) continue;
    for (const match of text.matchAll(setting)) {
      if (originOf(match[1]!) === PRODUCTION_WEB_ORIGIN) continue;
      violations.push(violation(`${path}:${lineAt(text, match.index ?? 0)}`, `This file sets ${VARIABLE} to ${match[1]}, which a production build refuses (ADR-0026).`, `Remove the setting, or set it to ${PRODUCTION_WEB_ORIGIN}.`));
      break;
    }
  }

  const value = env[VARIABLE];
  if (env.VERCEL_ENV === "production" && value !== undefined && originOf(value) !== PRODUCTION_WEB_ORIGIN) {
    violations.push(violation(`${VARIABLE} (environment)`, `This production build has ${VARIABLE} set to ${JSON.stringify(value)} (ADR-0026).`, `Unset ${VARIABLE} in the bullpen-landing Vercel project, or set it to ${PRODUCTION_WEB_ORIGIN}, then rebuild.`));
  }
  return violations;
}
