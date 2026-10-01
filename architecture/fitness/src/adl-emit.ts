import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { adlToJson, findAdlFile, loadAdlDocument, type AdlJson } from "./adl.js";

/** Where the landing page reads the parsed ADL from. It is generated, never committed. */
export const LANDING_ADL_JSON = join("apps", "landing", ".generated", "adl.json");

/**
 * Parses the repo's ADL with the one parser and writes the result as JSON, so
 * the landing page shows exactly what the checks enforce without importing
 * anything from architecture/. Throws, naming the file and line, if the ADL
 * cannot be parsed: a page must not be built from a rule that is not there.
 */
export function emitAdlJson(repoRoot: string, outFile: string = join(repoRoot, LANDING_ADL_JSON)): AdlJson {
  const adlFile = findAdlFile(repoRoot);
  if (!adlFile) throw new Error("architecture/adl/structure.adl not found");
  const json = adlToJson(loadAdlDocument(repoRoot), adlFile);
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, `${JSON.stringify(json, null, 2)}\n`);
  return json;
}
