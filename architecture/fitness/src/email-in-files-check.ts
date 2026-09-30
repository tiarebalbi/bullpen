import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { REPO_IDENTITY, emailFingerprint, type RepoIdentity } from "./identity.js";
import { lineAt } from "./source-scan.js";
import type { Violation } from "./violation.js";

const CHECK = "email in files";
const MAX_BYTES = 2 * 1024 * 1024;
const SKIPPED = new Set(["pnpm-lock.yaml"]);
const EMAIL_LIKE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;

/** Recorded in ADR-0009 (there is no ADL line for it: it is about what a public repo may contain). */
export const EMAIL_RULE = "no file in the repo contains the repo author's email address";

/** Tracked files plus new, unignored ones, so a leak is caught before it is committed. */
function listFiles(repoRoot: string): string[] {
  const output = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return output.split("\0").filter(Boolean);
}

/**
 * The repo is public and file contents get harvested, so the author's email
 * address must be in no file. The check never holds the address: it
 * fingerprints every email-shaped token it finds and compares that with the
 * identity's fingerprint, so it can flag the address without containing it.
 * Commit metadata (the author field) is not a file and is out of scope.
 */
export function checkEmailInFiles(repoRoot: string, identity: RepoIdentity = REPO_IDENTITY): Violation[] {
  const violations: Violation[] = [];
  for (const path of listFiles(repoRoot)) {
    if (SKIPPED.has(path)) continue;
    const absolute = join(repoRoot, path);
    let size: number;
    try {
      size = statSync(absolute).size;
    } catch {
      continue; // deleted in the working tree
    }
    if (size > MAX_BYTES) continue;
    const text = readFileSync(absolute, "utf8");
    if (text.includes("\0")) continue; // binary

    for (const token of text.matchAll(EMAIL_LIKE)) {
      if (emailFingerprint(token[0]) !== identity.emailSha256) continue;
      violations.push({
        check: CHECK,
        rule: EMAIL_RULE,
        where: `${path}:${lineAt(text, token.index ?? 0)}`,
        why: `This line contains the repo author's email address, and the repo is public (ADR-0009).`,
        fix: "Remove the address. Checks recognise it by fingerprint (architecture/fitness/src/identity.ts), so no file needs to contain it.",
      });
      break; // one per file is enough to act on
    }
  }
  return violations;
}
