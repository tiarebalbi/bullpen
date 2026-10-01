import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EMAIL_RULE, checkEmailInFiles } from "./email-in-files-check.js";
import { identityFor } from "./identity.js";
import { expectFailureFormat, realRepoRoot } from "./test-helpers.js";

// A made-up owner: no real address is written in any test either.
const OWNER_EMAIL = "owner@example.test";
const owner = identityFor("Repo Owner", OWNER_EMAIL);

function makeRepo(files: Record<string, string>, { commit = true }: { commit?: boolean } = {}): string {
  const root = mkdtempSync(join(tmpdir(), "email-in-files-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  git("init", "-b", "main");
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  if (commit) git("add", ".");
  return root;
}

describe("checkEmailInFiles", () => {
  it("passes a repo where no file contains the address, and other addresses are fine", () => {
    const root = makeRepo({ "README.md": "Write to someone@example.com or support@example.org.\n", "src/a.ts": "export const a = 1;\n" });
    expect(checkEmailInFiles(root, owner)).toEqual([]);
  });

  it("fails a file that contains the address, naming the file and line but never the address", () => {
    const root = makeRepo({ "docs/notes.md": `line one\nContact: ${OWNER_EMAIL}\n`, "src/a.ts": "export const a = 1;\n" });
    const violations = checkEmailInFiles(root, owner);

    expect(violations).toHaveLength(1);
    expect(violations[0]!.where).toBe("docs/notes.md:2");
    expect(violations[0]!.rule).toBe(EMAIL_RULE);
    expect(JSON.stringify(violations)).not.toContain(OWNER_EMAIL);
  });

  it("finds the address however it is written: upper case, in a mailto link, inside code", () => {
    const root = makeRepo({
      "a.md": `[mail](mailto:${OWNER_EMAIL.toUpperCase()})\n`,
      "b.ts": `const author = "Repo Owner <${OWNER_EMAIL}>";\n`,
    });
    expect(checkEmailInFiles(root, owner).map((v) => v.where.split(":")[0]).sort()).toEqual(["a.md", "b.ts"]);
  });

  it("catches a new file that is not committed or even staged yet", () => {
    const root = makeRepo({ "new.txt": `${OWNER_EMAIL}\n` }, { commit: false });
    expect(checkEmailInFiles(root, owner)).toHaveLength(1);
  });

  it("ignores files git ignores", () => {
    const root = makeRepo({ ".gitignore": "secret.env\n", "secret.env": `${OWNER_EMAIL}\n` });
    expect(checkEmailInFiles(root, owner)).toEqual([]);
  });

  it("fails in the shared format, citing ADR-0009, with nothing machine-specific", () => {
    const root = makeRepo({ "x.md": `${OWNER_EMAIL}\n` });
    const text = expectFailureFormat(checkEmailInFiles(root, owner)[0]!, "email in files");
    expect(text).toContain(`✗ email in files: ${EMAIL_RULE}`);
    expect(text).toContain("(ADR-0009)");
    expect(text).not.toContain(OWNER_EMAIL);
  });

  it("passes the real repo: the author's address is in no file it would commit", () => {
    expect(checkEmailInFiles(realRepoRoot)).toEqual([]);
  });
});
