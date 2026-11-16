import { Ajv } from "ajv";
import sweepTickSchema from "../schemas/sweep-tick.schema.json" with { type: "json" };
import type { ValidationResult } from "./cost.js";

/** The reply of the sweep route, which the sweeper reads to decide how soon to call again (ADR-0018). */
export interface SweepTick {
  at: string;
  /** Orders not terminal, or terminal with an unreleased reservation. Zero lets the caller back off. */
  open: number;
  flagged: number;
  fills: number;
  cancels: number;
  placed: number;
  cancelRequested: number;
  released: number;
  releaseFailed: number;
  /** Orders still queued for an open that has not come (ADR-0028). They never hold the fast cadence. */
  queued: number;
  /** Queued orders admitted to the venue by this pass (a batch, not the whole backlog). */
  admitted: number;
  /** Admitted orders whose reservation was topped up because the price passed the ceiling. */
  toppedUp: number;
  /** Queued orders refused at the open: no fresh price, or not enough buying power for the top-up. */
  admissionRejected: number;
  /** The next 9:30 ET on a trading day after `at`: the sweeper sleeps no longer than until it, so it is awake for the open (ADR-0028). */
  nextOpen: string;
  errors: number;
}

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true, formats: { "date-time": (value: string) => !Number.isNaN(Date.parse(value)) } });
const validateSweepTickSchema = ajv.compile(sweepTickSchema);

/** Validates a candidate object against the sweep reply schema (packages/contracts/schemas/sweep-tick.schema.json). */
export function validateSweepTick(data: unknown): ValidationResult {
  const valid = validateSweepTickSchema(data);
  return { valid, errors: valid ? null : ajv.errorsText(validateSweepTickSchema.errors, { separator: "\n" }) };
}
