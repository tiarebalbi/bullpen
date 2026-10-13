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

-- The price contract: symbol, price, as-of, source, stale. The only thing outside the owner that reads market_data.
CREATE OR REPLACE VIEW market_data.prices_v1 AS
  SELECT DISTINCT ON (symbol)
         symbol,
         price,
         as_of,
         source,
         (now() > valid_until) AS stale
    FROM market_data.quotes
   ORDER BY symbol, as_of DESC;

GRANT USAGE ON SCHEMA market_data TO trading_owner;
GRANT SELECT ON market_data.prices_v1 TO trading_owner;
