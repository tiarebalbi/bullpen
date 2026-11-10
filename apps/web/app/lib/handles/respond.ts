export const noStore = { "cache-control": "no-store" };

export interface HandleApiError {
  error: "sign-in-required" | "sign-in-unavailable" | "invalid-handle" | "handle-taken" | "handle-limit" | "not-found" | "already-decided" | "unavailable";
  message: string;
}

export const handleError = (status: number, body: HandleApiError): Response => Response.json(body, { status, headers: noStore });

/** The plain message for a player who has used up their changes: how many, in what window, and about when they may try again. */
export function limitMessage(limit: number, windowHours: number, retryAfterSeconds: number): string {
  const hours = Math.ceil(retryAfterSeconds / 3600);
  const when = hours <= 1 ? "in about an hour or less" : `in about ${hours} hours`;
  return `You have changed your handle ${limit} times in the last ${windowHours} hours, which is as many as I allow. Try again ${when}.`;
}

/** Says in the function log why a request failed: where, the error's name and code, a cut message. Never the player's id, and never anything from the request. */
export function logHandleFailure(at: string, error: unknown): void {
  const failure = error instanceof Error ? error : new Error(String(error));
  const code = (failure as { code?: unknown }).code;
  console.error(JSON.stringify({ at, name: failure.name, ...(typeof code === "string" ? { code } : {}), message: failure.message.slice(0, 200) }));
}
