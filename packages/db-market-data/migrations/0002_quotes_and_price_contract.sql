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

-- What kind of price a quote is, so a reader can tell how old a current one may be (ADR-0023). 'live' moves during the day; 'end-of-day' is a
-- close, current until the next trading day's close is expected. Added here, before the view that exposes it, so a re-run of this file
-- (every migration re-runs) never meets a view with a column it does not list.
ALTER TABLE market_data.quotes ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'live';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quotes_kind_check') THEN
    ALTER TABLE market_data.quotes ADD CONSTRAINT quotes_kind_check CHECK (kind IN ('live', 'end-of-day'));
  END IF;
END $$;
UPDATE market_data.quotes SET kind = 'end-of-day' WHERE source = 'alphavantage' AND kind <> 'end-of-day';

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
