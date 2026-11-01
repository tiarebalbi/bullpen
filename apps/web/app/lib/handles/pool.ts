import { createPool } from "@bullpen/db-handles";

let pool: ReturnType<typeof createPool> | undefined;

/** The handles owner's pool. Only this directory reads the handles database URL. */
export function handlesPool(): ReturnType<typeof createPool> {
  const url = process.env.DATABASE_URL_HANDLES;
  if (!url) throw new Error("DATABASE_URL_HANDLES is not set");
  pool ??= createPool(url);
  return pool;
}
