-- run-as: owner
-- Part 4: the order lifecycle (ADR-0017). Orders gain a state, a version and the quantities that must add up;
-- a reservation holds the buying power an open order may still spend; fills and events are the record
-- Postgres keeps of every order. Idempotent.
ALTER TABLE trading.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE trading.orders ALTER COLUMN price DROP NOT NULL;
ALTER TABLE trading.orders ALTER COLUMN price_as_of DROP NOT NULL;

ALTER TABLE trading.orders
  ADD COLUMN IF NOT EXISTS version             integer       NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS filled_qty          numeric(20,8) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS open_qty            numeric(20,8) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancelled_qty       numeric(20,8) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cap_price           numeric(20,8),
  ADD COLUMN IF NOT EXISTS client_order_id     text,
  ADD COLUMN IF NOT EXISTS cancel_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_effective_at timestamptz,
  ADD COLUMN IF NOT EXISTS needs_attention     text,
  ADD COLUMN IF NOT EXISTS updated_at          timestamptz   NOT NULL DEFAULT now();

-- Part 3's orders were filled in one transaction.
UPDATE trading.orders SET filled_qty = quantity WHERE status = 'filled' AND filled_qty + open_qty + cancelled_qty = 0;

ALTER TABLE trading.orders DROP CONSTRAINT IF EXISTS orders_state_check;
ALTER TABLE trading.orders ADD CONSTRAINT orders_state_check
  CHECK (status IN ('accepted', 'working', 'partially_filled', 'cancel_requested', 'cancelled', 'filled', 'rejected'));
ALTER TABLE trading.orders DROP CONSTRAINT IF EXISTS orders_quantities_check;
ALTER TABLE trading.orders ADD CONSTRAINT orders_quantities_check
  CHECK (filled_qty >= 0 AND open_qty >= 0 AND cancelled_qty >= 0 AND filled_qty + open_qty + cancelled_qty = quantity);

CREATE UNIQUE INDEX IF NOT EXISTS orders_client_order_id_idx ON trading.orders (account_id, client_order_id) WHERE client_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_open_idx ON trading.orders (updated_at) WHERE status IN ('accepted', 'working', 'partially_filled', 'cancel_requested');

CREATE TABLE IF NOT EXISTS trading.reservations (
  order_id         uuid          PRIMARY KEY REFERENCES trading.orders (order_id),
  account_id       uuid          NOT NULL REFERENCES trading.accounts (account_id),
  reserved         numeric(20,8) NOT NULL CHECK (reserved >= 0),
  spent            numeric(20,8) NOT NULL DEFAULT 0 CHECK (spent >= 0),
  released         numeric(20,8) NOT NULL DEFAULT 0 CHECK (released >= 0),
  released_at      timestamptz,
  release_failures integer       NOT NULL DEFAULT 0,
  last_release_error text,
  CHECK (spent + released <= reserved)
);

CREATE TABLE IF NOT EXISTS trading.fills (
  fill_id      text          PRIMARY KEY,
  order_id     uuid          NOT NULL REFERENCES trading.orders (order_id),
  account_id   uuid          NOT NULL REFERENCES trading.accounts (account_id),
  symbol       text          NOT NULL,
  quantity     numeric(20,8) NOT NULL CHECK (quantity > 0),
  price        numeric(20,8) NOT NULL CHECK (price > 0),
  executed_at  timestamptz   NOT NULL,
  received_at  timestamptz   NOT NULL DEFAULT now(),
  booked       boolean       NOT NULL DEFAULT true,
  anomaly      text
);
CREATE INDEX IF NOT EXISTS fills_order_idx ON trading.fills (order_id);

CREATE TABLE IF NOT EXISTS trading.order_events (
  event_id   bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id   uuid        NOT NULL REFERENCES trading.orders (order_id),
  at         timestamptz NOT NULL DEFAULT now(),
  kind       text        NOT NULL,
  from_state text,
  to_state   text,
  detail     jsonb       NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS order_events_order_idx ON trading.order_events (order_id, event_id);

-- A ledger entry that comes from a fill is unique per fill and asset, so a retry cannot write it twice.
ALTER TABLE trading.ledger ADD COLUMN IF NOT EXISTS fill_id text;
CREATE UNIQUE INDEX IF NOT EXISTS ledger_fill_asset_idx ON trading.ledger (fill_id, asset) WHERE fill_id IS NOT NULL;
