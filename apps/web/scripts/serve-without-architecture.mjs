// Serves the production build the way a Vercel function sees it: from a directory with no repo around it, so `architecture/` is not on disk.
// The regression this guards: layout.tsx read architecture/calm/bullpen.timeline.json with readFileSync at request time, which worked on static pages (rendered at
// build, with the repo present) and returned a 500 (ENOENT) on every dynamic route (/account, /admin/handles), whose function bundle does not carry the folder.
//
// Waits for the main e2e server (which runs `next build`), copies the build to a temp directory, refuses to start if an `architecture/` folder is reachable from it,
// then runs `next start` there. The temp directory is removed on exit. Nothing in the repository is moved or hidden.
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const port = process.argv[2] ?? "4321";
const buildServer = process.argv[3] ?? "http://127.0.0.1:4320";

const deadline = Date.now() + 170_000;
for (;;) {
  try {
    if ((await fetch(buildServer)).status < 500) break;
  } catch {
    // not up yet: the build is still running
  }
  if (Date.now() > deadline) throw new Error(`The build server ${buildServer} did not come up, so there is no build to serve.`);
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

const root = mkdtempSync(join(tmpdir(), "bullpen-no-architecture-"));
const app = join(root, "apps", "web");
mkdirSync(app, { recursive: true });
cpSync(join(web, ".next"), join(app, ".next"), { recursive: true });
for (const file of ["package.json", "next.config.ts"]) cpSync(join(web, file), join(app, file));
if (existsSync(join(web, "public"))) cpSync(join(web, "public"), join(app, "public"), { recursive: true });
symlinkSync(join(web, "node_modules"), join(app, "node_modules"), "dir");

// What the route would try to read: two levels up from the working directory.
for (const reachable of [join(root, "architecture"), join(root, "..", "architecture")]) {
  if (existsSync(reachable)) throw new Error(`${reachable} exists, so this would not prove the folder is not needed.`);
}

const server = spawn(process.execPath, [join(web, "node_modules", "next", "dist", "bin", "next"), "start", "-p", port], { cwd: app, stdio: "inherit", env: process.env });
const stop = () => {
  server.kill("SIGTERM");
  rmSync(root, { recursive: true, force: true });
};
process.on("SIGTERM", () => {
  stop();
  process.exit(0);
});
process.on("SIGINT", () => {
  stop();
  process.exit(0);
});
server.on("exit", (code) => {
  rmSync(root, { recursive: true, force: true });
  process.exit(code ?? 0);
});
