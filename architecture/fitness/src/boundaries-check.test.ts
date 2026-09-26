import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = join(__dirname, "__fixtures__");

// The first invocation may fetch the standalone turbo binary via npx, which
// can be slow, so this needs a generous timeout well above vitest's default.
const TIMEOUT_MS = 60_000;

interface ExecFailure {
  status: number | null;
  stdout: string;
  stderr: string;
}

function runTurboBoundaries(fixtureName: string): { status: 0; output: string } | ExecFailure {
  const cwd = join(fixturesRoot, fixtureName);
  try {
    const stdout = execSync("npx --yes turbo@2.11.4 boundaries", {
      cwd,
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1", TURBO_TELEMETRY_DISABLED: "1" },
    });
    return { status: 0, output: stdout };
  } catch (err) {
    const execErr = err as { status: number | null; stdout: string; stderr: string };
    return {
      status: execErr.status,
      stdout: execErr.stdout ?? "",
      stderr: execErr.stderr ?? "",
    };
  }
}

describe(
  "turbo boundaries (real mechanism, no mocking)",
  () => {
    it(
      "exits non-zero and reports the app->app tag violation when app-a imports app-b",
      () => {
        const result = runTurboBoundaries("boundaries-violation");

        expect(result.status).not.toBe(0);
        expect("stdout" in result).toBe(true);

        const failure = result as ExecFailure;
        const combined = failure.stdout + failure.stderr;

        // Confirms this is the app/app boundaries denylist violation, not
        // some unrelated config error (missing lockfile is expected/benign).
        expect(combined).toContain("app-b");
        expect(combined).toContain("denylist");
        expect(combined).toMatch(/for `app-a`/);
      },
      TIMEOUT_MS,
    );

    it(
      "exits zero when app-a does not depend on / import app-b",
      () => {
        const result = runTurboBoundaries("boundaries-good");

        expect(result.status).toBe(0);
      },
      TIMEOUT_MS,
    );
  },
  TIMEOUT_MS,
);
