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
  errors: number;
}

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true, formats: { "date-time": (value: string) => !Number.isNaN(Date.parse(value)) } });
const validateSweepTickSchema = ajv.compile(sweepTickSchema);

/** Validates a candidate object against the sweep reply schema (packages/contracts/schemas/sweep-tick.schema.json). */
export function validateSweepTick(data: unknown): ValidationResult {
  const valid = validateSweepTickSchema(data);
  return { valid, errors: valid ? null : ajv.errorsText(validateSweepTickSchema.errors, { separator: "\n" }) };
}
