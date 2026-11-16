import { readPrices } from "@bullpen/db-trading";
import { PriceHub } from "./priceHub.js";
import { readPool } from "./pool.js";
import { toStockPriceSnapshot } from "./snapshot.js";

const KEY = Symbol.for("bullpen.priceHub");

/**
 * This function instance's hub. Module scope would do on its own; the global key also survives a dev server's module reloads, so there is never a second hub
 * (and a second read per interval) in one process.
 */
export function priceHub(): PriceHub {
  const holder = globalThis as unknown as Record<symbol, PriceHub | undefined>;
  holder[KEY] ??= new PriceHub({
    read: async () => toStockPriceSnapshot(await readPrices(readPool())),
    onError: (error) => console.error(JSON.stringify({ at: "prices.stream.read", name: error instanceof Error ? error.name : "error", message: String(error instanceof Error ? error.message : error).slice(0, 300) })),
  });
  return holder[KEY]!;
}
