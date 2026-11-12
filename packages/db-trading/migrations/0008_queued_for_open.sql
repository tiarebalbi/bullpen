-- run-as: owner
-- Part 5: an order can wait for the open (ADR-0028). A stock market order placed while the market is closed is accepted and persisted
-- with its reservation, in the state queued_for_open, and is admitted to the venue in batches once the market opens. Idempotent.
ALTER TABLE trading.orders DROP CONSTRAINT IF EXISTS orders_state_check;
ALTER TABLE trading.orders ADD CONSTRAINT orders_state_check
  CHECK (status IN ('queued_for_open', 'accepted', 'working', 'partially_filled', 'cancel_requested', 'cancelled', 'filled', 'rejected'));

-- The admission batch reads the oldest queued orders first; a partial index keeps that read to the queue, however many orders exist.
CREATE INDEX IF NOT EXISTS orders_queued_idx ON trading.orders (created_at, order_id) WHERE status = 'queued_for_open';
