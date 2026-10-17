-- run-as: owner
-- The call ledger: how many calls each provider has been asked for in each of
-- its windows (a provider-day, a month). One row per provider and window.
CREATE TABLE IF NOT EXISTS market_data.provider_calls (
  provider   text        NOT NULL,
  window_key text        NOT NULL,
  calls      integer     NOT NULL CHECK (calls >= 0),
  refused    integer     NOT NULL DEFAULT 0 CHECK (refused >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, window_key)
);
