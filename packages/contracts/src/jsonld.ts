import { Ajv } from "ajv";
import jsonldSchema from "../schemas/jsonld.schema.json" with { type: "json" };
import type { ValidationResult } from "./cost.js";

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
const validateJsonLdSchema = ajv.compile(jsonldSchema);

/**
 * Validates the landing page's JSON-LD graph against
 * packages/contracts/schemas/jsonld.schema.json -- a narrow check (a
 * WebSite and a CreativeWorkSeries node with the fields this page actually
 * emits), not a general schema.org validator.
 */
export function validateJsonLd(data: unknown): ValidationResult {
  const valid = validateJsonLdSchema(data);
  return {
    valid,
    errors: valid ? null : ajv.errorsText(validateJsonLdSchema.errors, { separator: "\n" }),
  };
}
