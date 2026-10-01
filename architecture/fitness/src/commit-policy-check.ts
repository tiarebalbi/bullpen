import { execFileSync } from "node:child_process";
import { REPO_IDENTITY, emailFingerprint, type RepoIdentity } from "./identity.js";
import type { Violation } from "./violation.js";

const CHECK = "commit-policy";

/** Recorded in ADR-0009 (there is no ADL line for it: it is about history, not structure). */
export const COMMIT_POLICY_RULE = "every commit in a pull request has the repo author identity and no Co-Authored-By line";

export interface CommitRecord {
  sha: string;
  authorName: string;
  authorEmail: string;
  subject: string;
  hasCoAuthoredBy: boolean;
}

const COMMIT_HEADER = /^commit ([0-9a-f]{40})\b/;
const AUTHOR_LINE = /^Author:\s+(.*?)\s*<([^>]*)>\s*$/;
const TRAILER_LINE = /^\s*co-authored-by\s*:/i;

/**
 * Parses `git log --pretty=medium` output (the default `git log` shape):
 * a `commit <sha>` header, an `Author: Name <email>` line, then the message
 * indented by four spaces. A trailer is a message line that starts with
 * `Co-Authored-By:`, in any case; a sentence that only mentions the words
 * is not one.
 */
export function parseGitLog(raw: string): CommitRecord[] {
  const commits: CommitRecord[] = [];
  let current: CommitRecord | null = null;

  for (const line of raw.split("\n")) {
    const header = COMMIT_HEADER.exec(line);
    if (header) {
      current = { sha: header[1]!, authorName: "", authorEmail: "", subject: "", hasCoAuthoredBy: false };
      commits.push(current);
      continue;
    }
    if (!current) continue;

    const author = AUTHOR_LINE.exec(line);
    if (author && current.authorEmail === "" && current.authorName === "") {
      current.authorName = author[1]!.trim();
      current.authorEmail = author[2]!.trim();
      continue;
    }
    if (line.startsWith("    ")) {
      const message = line.slice(4);
      if (current.subject === "" && message.trim() !== "") current.subject = message.trim();
      else if (TRAILER_LINE.test(message)) current.hasCoAuthoredBy = true;
    }
  }
  return commits;
}

/**
 * One violation per offending commit, each naming the SHA and what is wrong
 * with it. The CI log is public, so when an offending commit carries the
 * repo's own email (the right address under the wrong name) the address is
 * never printed, only described.
 */
export function checkCommitPolicy(commits: CommitRecord[], identity: RepoIdentity = REPO_IDENTITY): Violation[] {
  const violations: Violation[] = [];

  for (const commit of commits) {
    const emailMatches = emailFingerprint(commit.authorEmail) === identity.emailSha256;
    const wrongAuthor = commit.authorName !== identity.name || !emailMatches;
    if (!wrongAuthor && !commit.hasCoAuthoredBy) continue;

    const problems: string[] = [];
    if (wrongAuthor) {
      const shownEmail = emailMatches ? "the repo email" : commit.authorEmail;
      problems.push(`its author is "${commit.authorName} <${shownEmail}>", not the repo identity`);
    }
    if (commit.hasCoAuthoredBy) problems.push("its message has a Co-Authored-By line");

    violations.push({
      check: CHECK,
      rule: COMMIT_POLICY_RULE,
      where: `commit ${commit.sha} (${commit.subject || "no subject"})`,
      why: `This commit breaks the rule because ${problems.join(" and ")} (ADR-0009).`,
      fix: [
        "Do not rewrite the pushed commit: stop and ask Tiare.",
        "The usual fix is a fresh branch from main with the same changes re-committed (no trailers) after",
        `\`git config --local user.name "${identity.name}"\` and \`git config --local user.email\` set to the repo email,`,
        "then a new pull request.",
      ].join(" "),
    });
  }
  return violations;
}

/** Reads the commits in `base..head` from the repo at `cwd`. Throws if git cannot resolve either end. */
export function readCommits(cwd: string, base: string, head: string): CommitRecord[] {
  const raw = execFileSync("git", ["log", "--no-color", "--no-decorate", "--pretty=medium", `${base}..${head}`], {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return parseGitLog(raw);
}

/** The whole check for one PR range: read the commits, then judge them. */
export function runCommitPolicy(
  cwd: string,
  base: string,
  head: string,
  identity: RepoIdentity = REPO_IDENTITY,
): { commits: CommitRecord[]; violations: Violation[] } {
  const commits = readCommits(cwd, base, head);
  return { commits, violations: checkCommitPolicy(commits, identity) };
}
