// @boundaries-ignore fixture for the entry-point imports check, not a real dependency
import { fmt } from "fixture-ui";
// @boundaries-ignore fixture for the entry-point imports check, not a real dependency
import { fmt as deep } from "fixture-ui/src/lib/format";
import { fmt as relative } from "../../../packages/ui/src/lib/format.ts";

console.log(fmt(1), deep(2), relative(3));
