import type { Pool } from "pg";

export interface MarketBuy {
  accountId: string;
  symbol: string;
  /** A decimal string, so money never passes through a float. */
  quantity: string;
}

export interface Fill {
  orderId: string;
  symbol: string;
  quantity: string;
  price: string;
  priceAsOf: Date;
  cost: string;
  buyingPower: string;
}

/** A buy that cannot proceed, with a message a player can read. */
export class BuyRefused extends Error {
  constructor(
    readonly reason: "stale-price" | "no-price" | "insufficient-buying-power" | "unknown-account",
    message: string,
  ) {
    super(message);
    this.name = "BuyRefused";
  }
}

/** Test seams: a point inside the transaction where a test can make the buy fail. */
export interface BuyHooks {
  /** After the price is read and before buying power is reserved: a test holds concurrent buys here until all have arrived. */
  afterPriceRead?: () => void | Promise<void>;
  afterOrderInsert?: () => void | Promise<void>;
}

/**
 * The smallest order that exercises the transaction (Part 4 owns the order
 * lifecycle): a market buy filled at the latest price of the price contract.
 * One transaction reserves buying power, inserts the order and its ledger
 * entries, and updates the position. The reservation is one conditional
 * UPDATE, so two buys that each fit but together overspend cannot both pass:
 * the second waits for the first's row lock and then finds too little.
 * Nothing is read, computed in code and written back.
 */
export async function placeMarketBuy(pool: Pool, buy: MarketBuy, hooks: BuyHooks = {}): Promise<Fill> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const priced = await client.query<{ price: string; as_of: Date; stale: boolean }>("SELECT price::text, as_of, stale FROM market_data.prices_v1 WHERE symbol = $1", [buy.symbol]);
    const quote = priced.rows[0];
    if (!quote) throw new BuyRefused("no-price", `Refused: there is no price for ${buy.symbol} yet.`);
    if (quote.stale) {
      throw new BuyRefused("stale-price", `Refused: the latest price for ${buy.symbol} is stale (as of ${quote.as_of.toISOString()}). I only fill at a current price.`);
    }

    await hooks.afterPriceRead?.();

    const reserved = await client.query<{ buying_power: string; cost: string }>(
      `WITH c AS (SELECT $2::numeric * $3::numeric AS cost)
       UPDATE trading.accounts AS a
          SET buying_power = a.buying_power - c.cost
         FROM c
        WHERE a.account_id = $1 AND a.buying_power >= c.cost
    RETURNING a.buying_power::text, c.cost::text`,
      [buy.accountId, buy.quantity, quote.price],
    );
    const reservation = reserved.rows[0];
    if (!reservation) {
      const known = await client.query("SELECT 1 FROM trading.accounts WHERE account_id = $1", [buy.accountId]);
      throw known.rowCount === 0
        ? new BuyRefused("unknown-account", "Refused: that account does not exist.")
        : new BuyRefused("insufficient-buying-power", `Refused: not enough buying power for ${buy.quantity} ${buy.symbol} at ${quote.price}.`);
    }

    const order = await client.query<{ order_id: string }>(
      `INSERT INTO trading.orders (account_id, symbol, side, quantity, price, price_as_of, status, filled_qty)
       VALUES ($1, $2, 'buy', $3, $4, $5, 'filled', $3) RETURNING order_id`,
      [buy.accountId, buy.symbol, buy.quantity, quote.price, quote.as_of],
    );
    const orderId = order.rows[0]!.order_id;
    await hooks.afterOrderInsert?.();

    await client.query(
      `INSERT INTO trading.ledger (order_id, account_id, asset, delta)
       VALUES ($1, $2, 'USD', -$3::numeric), ($1, $2, $4, $5::numeric)`,
      [orderId, buy.accountId, reservation.cost, buy.symbol, buy.quantity],
    );
    await client.query(
      `INSERT INTO trading.positions (account_id, symbol, quantity) VALUES ($1, $2, $3)
       ON CONFLICT (account_id, symbol) DO UPDATE SET quantity = trading.positions.quantity + EXCLUDED.quantity`,
      [buy.accountId, buy.symbol, buy.quantity],
    );

    await client.query("COMMIT");
    return { orderId, symbol: buy.symbol, quantity: buy.quantity, price: quote.price, priceAsOf: quote.as_of, cost: reservation.cost, buyingPower: reservation.buying_power };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
