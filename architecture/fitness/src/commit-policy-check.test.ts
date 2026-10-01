import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { COMMIT_POLICY_RULE, checkCommitPolicy, parseGitLog, runCommitPolicy } from "./commit-policy-check.js";
import { REPO_IDENTITY, emailFingerprint, identityFor } from "./identity.js";
import { formatViolation, formatViolations } from "./violation.js";

const logsDir = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__", "commit-logs");
const fixture = (name: string) => parseGitLog(readFileSync(join(logsDir, `${name}.txt`), "utf8"));

// The fixtures use a made-up owner, so no real address is written in any file.
const OWNER_NAME = "Repo Owner";
const OWNER_EMAIL = "owner@example.test";
const owner = identityFor(OWNER_NAME, OWNER_EMAIL);

describe("parseGitLog", () => {
  it("reads sha, author, subject and trailer from real `git log` output, merge commits included", () => {
    const commits = fixture("good");
    expect(commits).toHaveLength(2);
    expect(commits[0]).toMatchObject({
      sha: "5d1f0c2a9b7e4c3d8a6f1e0b2c4d5a7988776655",
      authorName: OWNER_NAME,
      authorEmail: OWNER_EMAIL,
      subject: "Merge branch 'main' into post-02-architecture-as-code",
      hasCoAuthoredBy: false,
    });
  });

  it("reads a trailer in any case, but not a sentence that only mentions the words", () => {
    expect(fixture("trailer")[0]!.hasCoAuthoredBy).toBe(true);
    expect(fixture("mixed")[2]!.hasCoAuthoredBy).toBe(true);
    expect(fixture("good")[1]!.hasCoAuthoredBy).toBe(false);
  });

  it("returns nothing for an empty range", () => {
    expect(parseGitLog("")).toEqual([]);
  });
});

describe("checkCommitPolicy against fixture commit logs", () => {
  it("passes commits by the repo identity with no trailer", () => {
    expect(checkCommitPolicy(fixture("good"), owner)).toEqual([]);
  });

  it("fails a GitHub UI squash merge, which replaces the author with the noreply identity", () => {
    const violations = checkCommitPolicy(fixture("ui-squash-merge"), owner);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.where).toContain("4afacbcf10c9d8e7b6a5948372615f4e3d2c1b0a");
    expect(violations[0]!.why).toContain("R. Owner <owner@users.noreply.example.test>");
  });

  it("fails a commit under the wrong email", () => {
    const [violation] = checkCommitPolicy(fixture("wrong-email"), owner);
    expect(violation!.why).toContain("someone@example.com");
  });

  it("fails a Co-Authored-By trailer even when the author is right", () => {
    const [violation] = checkCommitPolicy(fixture("trailer"), owner);
    expect(violation!.why).toContain("Co-Authored-By");
    expect(violation!.why).not.toContain("not the repo identity");
  });

  it("lists every offending SHA and only those", () => {
    const violations = checkCommitPolicy(fixture("mixed"), owner);
    const wheres = violations.map((v) => v.where);
    expect(wheres).toHaveLength(3);
    expect(wheres.some((w) => w.includes("bbbbbbbb"))).toBe(true);
    expect(wheres.some((w) => w.includes("cccccccc"))).toBe(true);
    expect(wheres.some((w) => w.includes("dddddddd"))).toBe(true);
    expect(wheres.some((w) => w.includes("aaaaaaaa"))).toBe(false);
    expect(violations.find((v) => v.where.includes("dddddddd"))!.why).toMatch(/author is .* and its message has a Co-Authored-By line/);
  });

  it("never prints the repo's own email, even when a commit carries it under the wrong name", () => {
    const [commit] = fixture("good");
    const wrongName = [{ ...commit!, authorName: "Somebody Else" }];
    const [violation] = checkCommitPolicy(wrongName, owner);
    expect(violation!.why).toContain('"Somebody Else <the repo email>"');
    expect(formatViolation(violation!)).not.toContain(OWNER_EMAIL);
  });
});

describe("the repo identity", () => {
  it("is a fingerprint, never the address: the real identity file holds 64 hex characters and no email", () => {
    expect(REPO_IDENTITY.emailSha256).toMatch(/^[0-9a-f]{64}$/);
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "identity.ts"), "utf8");
    expect(source).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  });

  it("fingerprints case- and whitespace-insensitively", () => {
    expect(emailFingerprint("  Owner@Example.Test ")).toBe(emailFingerprint(OWNER_EMAIL));
    expect(emailFingerprint("other@example.test")).not.toBe(emailFingerprint(OWNER_EMAIL));
  });
});

describe("commit-policy failure format", () => {
  it("is the shared four-line format, ending in the ADR, with a fix an agent can act on", () => {
    const [violation] = checkCommitPolicy(fixture("ui-squash-merge"), owner);
    const lines = formatViolation(violation!).split("\n");

    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe(`✗ commit-policy: ${COMMIT_POLICY_RULE}`);
    expect(lines[1]).toMatch(/^ {2}where: {3}commit 4afacbcf10c9d8e7b6a5948372615f4e3d2c1b0a \(Bullpen: interactive architecture explorer \(#15\)\)$/);
    expect(lines[2]).toMatch(/^ {2}why: {5}.+\(ADR-0009\)\.$/);
    expect(lines[3]).toMatch(/^ {2}fix: {5}Do not rewrite the pushed commit: stop and ask Tiare\./);
  });

  it("prints one block per offending commit for a mixed range", () => {
    const output = formatViolations(checkCommitPolicy(fixture("mixed"), owner));
    expect(output.split("\n\n")).toHaveLength(3);
    expect(output).toContain(`✗ commit-policy: ${COMMIT_POLICY_RULE}`);
  });
});

describe("runCommitPolicy against a real repo", () => {
  const scratch = mkdtempSync(join(tmpdir(), "commit-policy-"));
  const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" };
  const git = (...args: string[]) => execFileSync("git", args, { cwd: scratch, encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"] }).trim();
  const commit = (message: string, name: string, email: string) => {
    writeFileSync(join(scratch, "file.txt"), `${message}\n${Math.random()}\n`);
    git("add", ".");
    git("-c", `user.name=${name}`, "-c", `user.email=${email}`, "commit", "-m", message);
    return git("rev-parse", "HEAD");
  };

  afterAll(() => rmSync(scratch, { recursive: true, force: true }));

  it("checks exactly the commits between base and head", () => {
    git("init", "-b", "main");
    const base = commit("base commit by someone else, outside the range", "Somebody", "somebody@example.com");
    commit("good", OWNER_NAME, OWNER_EMAIL);
    const wrong = commit("wrong identity", "R. Owner", "owner@users.noreply.example.test");
    const trailer = commit("has trailer\n\nCo-Authored-By: A <a@example.com>", OWNER_NAME, OWNER_EMAIL);
    const head = git("rev-parse", "HEAD");

    const { commits, violations } = runCommitPolicy(scratch, base, head, owner);

    expect(commits).toHaveLength(3);
    expect(violations.map((v) => v.where.split(" ")[1])).toEqual([trailer, wrong]);
  });

  it("throws on a range git cannot resolve, so the CLI fails closed", () => {
    expect(() => runCommitPolicy(scratch, "0".repeat(40), "HEAD", owner)).toThrow();
  });
});
