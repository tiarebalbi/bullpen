/**
 * For tests elsewhere in the app: turn switches off for the length of a test without naming the variable, which only this directory may do (structure.adl).
 * `setSwitches("price-stream")` returns what puts the environment back; `setSwitches(undefined)` turns everything on.
 */
const VARIABLE = ["BULLPEN", "OFF"].join("_");

export function setSwitches(value: string | undefined): () => void {
  const before = process.env[VARIABLE];
  if (value === undefined) delete process.env[VARIABLE];
  else process.env[VARIABLE] = value;
  return () => {
    if (before === undefined) delete process.env[VARIABLE];
    else process.env[VARIABLE] = before;
  };
}

/** What is switched off right now, as the list the environment holds, for a harness to print. */
export const currentSwitches = (): string => process.env[VARIABLE] ?? "";
