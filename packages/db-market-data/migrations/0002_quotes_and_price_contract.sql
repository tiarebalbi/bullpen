-- run-as: owner
-- Every quote the owner has stored, and the one view other owners may read.
CREATE TABLE IF NOT EXISTS market_data.quotes (
  symbol      text          NOT NULL,
  as_of       timestamptz   NOT NULL,
  price       numeric(20,8) NOT NULL CHECK (price > 0),
  source      text          NOT NULL,
  fetched_at  timestamptz   NOT NULL DEFAULT now(),
  -- When the price stops being current: set at ingest from the symbol's cadence.
  valid_until timestamptz   NOT NULL,
  PRIMARY KEY (symbol, as_of)
);

-- What kind of price a quote is, so a reader can tell how old a current one may be (ADR-0024). 'live' moves during the day; 'end-of-day' is a
-- close, current until the next trading day's close is expected. Added here, before the view that exposes it, so a re-run of this file
-- (the migrator re-runs every file on every build) never meets a view with a column it does not list.
-- Every quote stored before this column existed is a stock close, so they are all backfilled to 'end-of-day', once: only when the column is
-- added. A re-run must not touch the kind of a row stored since.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'market_data' AND table_name = 'quotes' AND column_name = 'kind') THEN
    ALTER TABLE market_data.quotes ADD COLUMN kind text NOT NULL DEFAULT 'end-of-day';
    ALTER TABLE market_data.quotes ALTER COLUMN kind SET DEFAULT 'live';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quotes_kind_check') THEN
    ALTER TABLE market_data.quotes ADD CONSTRAINT quotes_kind_check CHECK (kind IN ('live', 'end-of-day'));
  END IF;
END $$;

-- The price contract: symbol, price, as-of, source, stale, kind. The only thing outside the owner that reads market_data.
CREATE OR REPLACE VIEW market_data.prices_v1 AS
  SELECT DISTINCT ON (symbol)
         symbol,
         price,
         as_of,
         source,
         (now() > valid_until) AS stale,
         kind
    FROM market_data.quotes
   ORDER BY symbol, as_of DESC;

GRANT USAGE ON SCHEMA market_data TO trading_owner;
GRANT SELECT ON market_data.prices_v1 TO trading_owner;
