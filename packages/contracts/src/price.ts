import { Ajv } from "ajv";
import coinGeckoPriceSchema from "../schemas/coingecko-price.schema.json" with { type: "json" };
import priceSnapshotSchema from "../schemas/price-snapshot.schema.json" with { type: "json" };
import type { ValidationResult } from "./cost.js";

export interface CoinGeckoPriceResponse {
  [coinId: string]: {
    usd: number;
    usd_24h_change: number;
    last_updated_at: number;
  };
}

export type PriceSource = "coingecko";

export interface PriceSnapshot {
  symbol: string;
  price: number;
  /** Signed 24h percent change, passed through from CoinGecko's real usd_24h_change. */
  changePercent: number;
  /** ISO 8601 timestamp of the upstream price tick. */
  time: string;
  source: PriceSource;
  /** ISO 8601 timestamp of when the route produced this response. */
  fetchedAt: string;
}

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });

const validateCoinGeckoPriceSchema = ajv.compile(coinGeckoPriceSchema);
const validatePriceSnapshotSchema = ajv.compile(priceSnapshotSchema);

function toResult(valid: boolean, errors: typeof validateCoinGeckoPriceSchema.errors): ValidationResult {
  return {
    valid,
    errors: valid ? null : ajv.errorsText(errors, { separator: "\n" }),
  };
}

/**
 * Validates a candidate object against CoinGecko's `/simple/price` upstream
 * response schema (packages/contracts/schemas/coingecko-price.schema.json).
 */
export function validateCoinGeckoPrice(data: unknown): ValidationResult {
  const valid = validateCoinGeckoPriceSchema(data);
  return toResult(valid, validateCoinGeckoPriceSchema.errors);
}

/**
 * Validates a candidate object against Bullpen's own price snapshot
 * response schema (packages/contracts/schemas/price-snapshot.schema.json).
 */
export function validatePriceSnapshot(data: unknown): ValidationResult {
  const valid = validatePriceSnapshotSchema(data);
  return toResult(valid, validatePriceSnapshotSchema.errors);
}
