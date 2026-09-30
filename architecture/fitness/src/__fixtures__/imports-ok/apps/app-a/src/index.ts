// A comment may talk about fixture-ui/src/lib/format without importing it.
// @boundaries-ignore fixture for the entry-point imports check, not a real dependency
import { fmt } from "fixture-ui";
// @boundaries-ignore fixture for the entry-point imports check, not a real dependency
import "fixture-ui/styles.css";
import { readFileSync } from "node:fs";

const note = "not an import: from 'fixture-ui/src/lib/format'";
console.log(fmt(1), readFileSync, note);
