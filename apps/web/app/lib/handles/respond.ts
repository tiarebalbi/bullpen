export const noStore = { "cache-control": "no-store" };

export interface HandleApiError {
  error: "sign-in-required" | "sign-in-unavailable" | "invalid-handle" | "handle-taken" | "not-found" | "already-decided" | "unavailable";
  message: string;
}

export const handleError = (status: number, body: HandleApiError): Response => Response.json(body, { status, headers: noStore });

/** Says in the function log why a request failed: where, the error's name and code, a cut message. Never the player's id, and never anything from the request. */
export function logHandleFailure(at: string, error: unknown): void {
  const failure = error instanceof Error ? error : new Error(String(error));
  const code = (failure as { code?: unknown }).code;
  console.error(JSON.stringify({ at, name: failure.name, ...(typeof code === "string" ? { code } : {}), message: failure.message.slice(0, 200) }));
}
