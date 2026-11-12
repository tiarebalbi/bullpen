/**
 * Holds a local Postgres cluster to a fraction of one core by stopping and continuing its processes on a duty cycle (SIGSTOP / SIGCONT), the way a 0.25 CU compute
 * has a quarter of a vCPU. It is an approximation, and says so: a stopped backend that holds a lock holds it for the stopped part of the cycle, which a real
 * quarter-core would not do. Use it to make the database the bottleneck on purpose, not to claim Neon's numbers.
 *
 *   tsx src/load/throttle.ts <cluster, e.g. 16/load> <fraction, e.g. 0.25>
 */
import { readdirSync, readFileSync } from "node:fs";

const [cluster = "", fractionText = "1"] = process.argv.slice(2);
const fraction = Number(fractionText);
if (!cluster || !(fraction > 0 && fraction <= 1)) {
  console.error("usage: tsx src/load/throttle.ts <cluster> <fraction 0..1>");
  process.exit(1);
}
const PERIOD_MS = 20;

function pids(): number[] {
  const found: number[] = [];
  for (const name of readdirSync("/proc")) {
    if (!/^\d+$/.test(name)) continue;
    try {
      const cmd = readFileSync(`/proc/${name}/cmdline`, "utf8").replaceAll("\0", " ");
      if (cmd.includes(cluster) && cmd.includes("postgres")) found.push(Number(name));
    } catch {
      // the process ended between listing and reading
    }
  }
  return found;
}
const signal = (list: number[], sig: "SIGSTOP" | "SIGCONT"): void => {
  for (const pid of list) {
    try {
      process.kill(pid, sig);
    } catch {
      // gone
    }
  }
};

let list = pids();
setInterval(() => (list = pids()), 250);
const release = (): never => {
  signal(list, "SIGCONT");
  process.exit(0);
};
process.on("SIGTERM", release);
process.on("SIGINT", release);

const cycle = (): void => {
  signal(list, "SIGCONT");
  setTimeout(() => {
    if (fraction < 1) signal(list, "SIGSTOP");
    setTimeout(cycle, PERIOD_MS * (1 - fraction));
  }, PERIOD_MS * fraction);
};
console.log(JSON.stringify({ throttling: cluster, fraction, processes: list.length }));
cycle();
