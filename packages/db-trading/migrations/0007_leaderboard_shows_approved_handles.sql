-- run-as: owner
-- ADR-0027: the leaderboard shows a player's handle once it is approved, and the neutral "Player ####" label until then. The only thing read from the
-- handles owner is its published view, handles.approved_v1 (owner_user_id, handle): nothing pending, in review or rejected is in it, so none of it can reach
-- a page. The view is re-created once, when its definition does not mention the handles view yet; a later run changes nothing. The new handle shows at
-- the next refresh, like every other change to the ranking (ADR-0014).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_matviews WHERE schemaname = 'trading' AND matviewname = 'leaderboard_mv' AND definition LIKE '%approved_v1%') THEN
    DROP MATERIALIZED VIEW IF EXISTS trading.leaderboard_mv;
    CREATE MATERIALIZED VIEW trading.leaderboard_mv AS
      SELECT a.account_id,
             COALESCE(h.handle, a.handle)                                                              AS handle,
             (a.buying_power + COALESCE(r.held, 0))::numeric(20,8)                                     AS cash,
             COALESCE(SUM(p.quantity * pr.price), 0)::numeric(20,8)                                    AS positions_value,
             (a.buying_power + COALESCE(r.held, 0) + COALESCE(SUM(p.quantity * pr.price), 0))::numeric(20,8) AS equity,
             RANK() OVER (ORDER BY a.buying_power + COALESCE(r.held, 0) + COALESCE(SUM(p.quantity * pr.price), 0) DESC)::integer AS rank
        FROM trading.accounts a
        LEFT JOIN handles.approved_v1 h ON h.owner_user_id = a.owner_user_id
        LEFT JOIN (SELECT account_id, SUM(reserved - spent - released) AS held FROM trading.reservations GROUP BY account_id) r ON r.account_id = a.account_id
        LEFT JOIN trading.positions p ON p.account_id = a.account_id
        LEFT JOIN market_data.prices_v1 pr ON pr.symbol = p.symbol
       GROUP BY a.account_id, a.handle, h.handle, a.buying_power, r.held;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS leaderboard_mv_account_id_idx ON trading.leaderboard_mv (account_id);
