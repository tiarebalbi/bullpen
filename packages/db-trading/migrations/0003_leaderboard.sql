-- run-as: owner
-- The leaderboard: every account's cash and positions valued at the price
-- contract, ranked. A materialized view, so a read never recomputes it, with a
-- unique index so it can be refreshed CONCURRENTLY, and one row that says when
-- it was last refreshed and whether the last attempt failed.
CREATE MATERIALIZED VIEW IF NOT EXISTS trading.leaderboard_mv AS
  SELECT a.account_id,
         a.handle,
         a.buying_power::numeric(20,8)                                           AS cash,
         COALESCE(SUM(p.quantity * pr.price), 0)::numeric(20,8)                  AS positions_value,
         (a.buying_power + COALESCE(SUM(p.quantity * pr.price), 0))::numeric(20,8) AS equity,
         RANK() OVER (ORDER BY a.buying_power + COALESCE(SUM(p.quantity * pr.price), 0) DESC)::integer AS rank
    FROM trading.accounts a
    LEFT JOIN trading.positions p ON p.account_id = a.account_id
    LEFT JOIN market_data.prices_v1 pr ON pr.symbol = p.symbol
   GROUP BY a.account_id, a.handle, a.buying_power;

CREATE UNIQUE INDEX IF NOT EXISTS leaderboard_mv_account_id_idx ON trading.leaderboard_mv (account_id);

CREATE TABLE IF NOT EXISTS trading.leaderboard_refresh (
  id             boolean     PRIMARY KEY DEFAULT true CHECK (id),
  refreshed_at   timestamptz NOT NULL,
  duration_ms    integer,
  last_failed_at timestamptz,
  last_error     text
);
INSERT INTO trading.leaderboard_refresh (id, refreshed_at) VALUES (true, now()) ON CONFLICT (id) DO NOTHING;
