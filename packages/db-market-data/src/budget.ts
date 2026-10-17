import type { Pool } from "pg";

export interface CallReservation {
  granted: boolean;
  /** Calls counted in this window, the one just reserved included when granted. */
  calls: number;
  cap: number;
}

/**
 * Counts one provider call against its window and says whether it may go out.
 * It is one statement: the insert-or-increment is conditional on the count
 * being under the cap, so two callers cannot both take the last call. A call
 * over the cap changes nothing but the refusal count, and is refused here,
 * before anything leaves the process.
 */
export async function reserveProviderCall(pool: Pool, provider: string, windowKey: string, cap: number): Promise<CallReservation> {
  if (cap < 1) return { granted: false, calls: 0, cap };
  const reserved = await pool.query<{ calls: number }>(
    `INSERT INTO market_data.provider_calls AS p (provider, window_key, calls)
     VALUES ($1, $2, 1)
     ON CONFLICT (provider, window_key)
     DO UPDATE SET calls = p.calls + 1, updated_at = now()
           WHERE p.calls < $3
     RETURNING p.calls`,
    [provider, windowKey, cap],
  );
  if (reserved.rows[0]) return { granted: true, calls: reserved.rows[0].calls, cap };

  const refused = await pool.query<{ calls: number }>(
    `UPDATE market_data.provider_calls SET refused = refused + 1, updated_at = now()
      WHERE provider = $1 AND window_key = $2 RETURNING calls`,
    [provider, windowKey],
  );
  return { granted: false, calls: refused.rows[0]?.calls ?? cap, cap };
}
