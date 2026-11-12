-- run-as: owner
-- Part 5: the account poll read every row of orders, fills and reservations to find one player's (a sequential scan each, measured: post-facts/part-05.md). Every
-- open screen runs it every 3 s, so its cost grew with the whole league's history instead of the player's own. These indexes are what its queries filter and sort on.
-- Idempotent.
CREATE INDEX IF NOT EXISTS orders_account_created_idx ON trading.orders (account_id, created_at DESC, order_id);
CREATE INDEX IF NOT EXISTS fills_account_executed_idx ON trading.fills (account_id, executed_at DESC, fill_id) WHERE booked;
CREATE INDEX IF NOT EXISTS fills_account_symbol_idx ON trading.fills (account_id, symbol) WHERE booked;
CREATE INDEX IF NOT EXISTS reservations_account_idx ON trading.reservations (account_id);
