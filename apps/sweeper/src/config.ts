/** The only route the sweeper calls (ADR-0018). A target URL that ends anywhere else gets a 405 or a 404 every five minutes and nothing else says why. */
export const SWEEP_PATH = "/api/internal/sweep";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "host.docker.internal"]);

/**
 * What is wrong with the sweeper's two variables, as sentences that name the variable and never print its value. Empty when both are usable.
 * Plain http is allowed only for a machine's own address, which is how the tests and the container measurement reach a stand-in route.
 */
export function configProblems(url: string | undefined, token: string | undefined): string[] {
  const problems: string[] = [];
  if (!token) problems.push("SWEEPER_TOKEN is not set");
  if (!url) return [...problems, "SWEEPER_TARGET_URL is not set"];
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return [...problems, "SWEEPER_TARGET_URL is not a URL"];
  }
  if (target.protocol !== "https:" && !(target.protocol === "http:" && LOCAL_HOSTS.has(target.hostname))) problems.push("SWEEPER_TARGET_URL must be an https URL");
  if (target.username || target.password) problems.push("SWEEPER_TARGET_URL must not carry credentials; the token is SWEEPER_TOKEN");
  if (target.pathname !== SWEEP_PATH) problems.push(`SWEEPER_TARGET_URL must end at ${SWEEP_PATH}, not at "${target.pathname}"`);
  return problems;
}
