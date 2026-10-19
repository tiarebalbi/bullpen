-- run-as: owner
-- Accounts, orders, the ledger and positions: one transactional boundary.
CREATE TABLE IF NOT EXISTS trading.accounts (
  account_id   uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  handle       text          NOT NULL UNIQUE,
  buying_power numeric(20,8) NOT NULL CHECK (buying_power >= 0),
  created_at   timestamptz   NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trading.orders (
  order_id     uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid          NOT NULL REFERENCES trading.accounts (account_id),
  symbol       text          NOT NULL,
  side         text          NOT NULL CHECK (side = 'buy'),
  quantity     numeric(20,8) NOT NULL CHECK (quantity > 0),
  price        numeric(20,8) NOT NULL CHECK (price > 0),
  price_as_of  timestamptz   NOT NULL,
  status       text          NOT NULL CHECK (status = 'filled'),
  created_at   timestamptz   NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trading.ledger (
  entry_id   bigint        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id   uuid          NOT NULL REFERENCES trading.orders (order_id),
  account_id uuid          NOT NULL REFERENCES trading.accounts (account_id),
  asset      text          NOT NULL,
  delta      numeric(20,8) NOT NULL,
  created_at timestamptz   NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trading.positions (
  account_id uuid          NOT NULL REFERENCES trading.accounts (account_id),
  symbol     text          NOT NULL,
  quantity   numeric(20,8) NOT NULL CHECK (quantity >= 0),
  PRIMARY KEY (account_id, symbol)
);
