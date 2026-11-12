/**
 * Kill switches (ADR-0031): features that can be turned off by configuration, not by editing code. One variable, `BULLPEN_OFF`, holds a comma-separated list of
 * switch names; a switch is off when its name is in the list. Unset or empty, everything is on. Order entry has no switch: it is the last thing to go.
 *
 * Only this directory reads the variable (structure.adl). Changing it is an environment change followed by a redeploy, which is the owner's to make.
 */
export const SWITCHES = ["handle-moderation", "leaderboard-refresh", "price-stream"] as const;
export type Switch = (typeof SWITCHES)[number];

/**
 * The order in which things switch off when capacity runs out (ADR-0031): the first is the cheapest to lose and the most expendable. Each step is a
 * switch; after the last of them, what remains degrades by itself (polling answers, stale prices, a safe refusal), and order entry is the last to go.
 */
export const SWITCH_ORDER: readonly Switch[] = ["handle-moderation", "leaderboard-refresh", "price-stream"];

/** The switches named in a `BULLPEN_OFF` value. A name that is not a switch is ignored, so a typo cannot turn off something else. */
export function switchesOff(value: string | undefined): ReadonlySet<Switch> {
  const named = (value ?? "").split(",").map((part) => part.trim().toLowerCase()).filter((part) => part !== "");
  return new Set(SWITCHES.filter((name) => named.includes(name)));
}

/** Whether a switch is off right now. Read at the time of the call, so a test, or a redeployed instance, sees its own environment. */
export const isOff = (name: Switch, env: Readonly<Record<string, string | undefined>> = process.env): boolean => switchesOff(env.BULLPEN_OFF).has(name);
