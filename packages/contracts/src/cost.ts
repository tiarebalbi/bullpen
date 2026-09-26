import { Ajv } from "ajv";
import allowancesSchema from "../schemas/allowances.schema.json" with { type: "json" };
import usageSchema from "../schemas/usage.schema.json" with { type: "json" };

export interface ValidationResult {
  valid: boolean;
  errors: string | null;
}

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });

const validateAllowancesSchema = ajv.compile(allowancesSchema);
const validateUsageSchema = ajv.compile(usageSchema);

function toResult(valid: boolean, errors: typeof validateAllowancesSchema.errors): ValidationResult {
  return {
    valid,
    errors: valid ? null : ajv.errorsText(errors, { separator: "\n" }),
  };
}

/**
 * Validates a candidate object against the cost allowances ledger schema
 * (packages/contracts/schemas/allowances.schema.json).
 */
export function validateAllowances(data: unknown): ValidationResult {
  const valid = validateAllowancesSchema(data);
  return toResult(valid, validateAllowancesSchema.errors);
}

/**
 * Validates a candidate object against the weekly usage snapshot schema
 * (packages/contracts/schemas/usage.schema.json).
 */
export function validateUsage(data: unknown): ValidationResult {
  const valid = validateUsageSchema(data);
  return toResult(valid, validateUsageSchema.errors);
}
