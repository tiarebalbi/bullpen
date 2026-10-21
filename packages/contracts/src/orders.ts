import { Ajv } from "ajv";
import accountViewSchema from "../schemas/account-view.schema.json" with { type: "json" };
import orderRequestSchema from "../schemas/order-request.schema.json" with { type: "json" };
import type { ValidationResult } from "./cost.js";

export type OrderState = "accepted" | "working" | "partially_filled" | "cancel_requested" | "cancelled" | "filled" | "rejected";

/** The body of POST /api/orders: a market buy, made idempotent by the client's key. */
export interface OrderRequest {
  symbol: string;
  /** A positive decimal string with at most 8 places. */
  quantity: string;
  clientOrderId: string;
}

export interface OrderView {
  orderId: string;
  symbol: string;
  side: "buy";
  type: "market";
  state: OrderState;
  quantity: string;
  filledQty: string;
  openQty: string;
  cancelledQty: string;
  avgPrice: string | null;
  capPrice: string;
  reserved: string;
  spent: string;
  released: string;
  releaseDone: boolean;
  needsAttention: string | null;
  createdAt: string;
  cancelRequestedAt: string | null;
}

export interface PositionView {
  symbol: string;
  quantity: string;
  price: string | null;
  value: string | null;
}

/** What GET /api/orders answers. The lifecycle builds it; the screens read it. Nothing in it names a person. */
export interface AccountView {
  label: string;
  buyingPower: string;
  reserved: string;
  cash: string;
  positionsValue: string;
  equity: string;
  positions: PositionView[];
  orders: OrderView[];
  asOf: string;
}

/** What the order routes answer when they cannot do what was asked: a short code a screen can act on, and words a player can read. */
export interface ApiError {
  error: "sign-in-required" | "sign-in-unavailable" | "invalid-request" | "refused" | "not-found" | "unavailable";
  message: string;
  reason?: string;
}

const formats = { "date-time": (value: string) => !Number.isNaN(Date.parse(value)), uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i };
const ajv = new Ajv({ allErrors: true, allowUnionTypes: true, formats });
const accountViewValidator = ajv.compile(accountViewSchema);
const orderRequestValidator = ajv.compile(orderRequestSchema);

const result = (valid: boolean, errors: string | null): ValidationResult => ({ valid, errors: valid ? null : errors });

/** Validates a candidate against the account view schema (packages/contracts/schemas/account-view.schema.json). */
export function validateAccountView(data: unknown): ValidationResult {
  return result(accountViewValidator(data), ajv.errorsText(accountViewValidator.errors, { separator: "\n" }));
}

/** Validates a candidate against the order request schema (packages/contracts/schemas/order-request.schema.json). */
export function validateOrderRequest(data: unknown): ValidationResult {
  return result(orderRequestValidator(data), ajv.errorsText(orderRequestValidator.errors, { separator: "\n" }));
}
