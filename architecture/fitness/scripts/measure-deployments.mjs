// Reads what Vercel did for one commit: every deployment of bullpen-web and bullpen-landing for that
// SHA, with when it was created, when its build started, and when it was ready. Read-only.
//
//   node architecture/fitness/scripts/measure-deployments.mjs --sha <sha> --pushed-at <epoch ms> [--out <file>]
//
// It uses the Vercel CLI's own login (`vercel api`), so it needs `vercel login` once and prints no token.
// It waits until the web deployment has finished (ready, errored or cancelled) or 20 minutes pass.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const sha = option("--sha");
const pushedAt = Number(option("--pushed-at"));
const out = option("--out");
if (!sha || !Number.isFinite(pushedAt)) {
  console.error("usage: measure-deployments.mjs --sha <sha> --pushed-at <epoch ms> [--out <file>]");
  process.exit(1);
}

const TEAM = "team_weeGPdr1H608Xc48IkkZ05KR";
const PROJECTS = { "bullpen-web": "prj_p85xsA3wu0WvsSeyg0itcH1y8bQE", "bullpen-landing": "prj_pB7JIpfnb4VQqpGoHsPQyRF4dlC8" };
const FINAL = new Set(["READY", "ERROR", "CANCELED"]);

function api(path) {
  const text = execFileSync("vercel", ["api", path], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  return JSON.parse(text.slice(text.indexOf("{")));
}

function deploymentsFor(projectId) {
  const list = api(`/v6/deployments?projectId=${projectId}&teamId=${TEAM}&limit=20`).deployments;
  return list.filter((d) => d.meta?.githubCommitSha === sha);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const deadline = Date.now() + 20 * 60_000;
let found = {};
for (;;) {
  found = Object.fromEntries(Object.entries(PROJECTS).map(([name, id]) => [name, deploymentsFor(id)]));
  const web = found["bullpen-web"];
  if (web.length > 0 && web.every((d) => FINAL.has(d.readyState ?? d.state))) break;
  if (Date.now() > deadline) break;
  await sleep(4000);
}
await sleep(8000); // the landing project's deployment can appear a few seconds after the web one
found = Object.fromEntries(Object.entries(PROJECTS).map(([name, id]) => [name, deploymentsFor(id)]));

const rows = [];
for (const [project, list] of Object.entries(found)) {
  for (const d of list) {
    const full = api(`/v13/deployments/${d.uid}?teamId=${TEAM}`);
    rows.push({
      project,
      id: d.uid,
      url: d.url,
      state: full.readyState,
      target: full.target ?? "preview",
      pushedToCreatedMs: full.createdAt - pushedAt,
      queuedMs: full.buildingAt ? full.buildingAt - full.createdAt : null,
      buildMs: full.buildingAt && full.ready ? full.ready - full.buildingAt : null,
      pushedToReadyMs: full.ready ? full.ready - pushedAt : null,
      createdAt: new Date(full.createdAt).toISOString(),
      buildingAt: full.buildingAt ? new Date(full.buildingAt).toISOString() : null,
      readyAt: full.ready ? new Date(full.ready).toISOString() : null,
    });
  }
}
const result = { sha, pushedAt: new Date(pushedAt).toISOString(), measuredAt: new Date().toISOString(), deployments: rows };
const json = JSON.stringify(result, null, 2);
if (out) writeFileSync(out, `${json}\n`);
console.log(json);
