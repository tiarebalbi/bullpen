-- run-as: owner
-- ADR-0027: a player's public handle and the queue of handles a person must look at. One row per player, keyed by the Neon Auth user id (text, as in
-- trading.accounts.owner_user_id); Bullpen stores no name, email or sign-in login here either. A handle is shown publicly only when it is 'approved'.
CREATE TABLE IF NOT EXISTS handles.handle (
  handle_id     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id text        NOT NULL UNIQUE,
  handle        text        NOT NULL CHECK (handle ~ '^[A-Za-z0-9_-]{3,20}$'),
  status        text        NOT NULL CHECK (status IN ('pending', 'approved', 'review', 'rejected')),
  probability   numeric(6,5) CHECK (probability IS NULL OR (probability >= 0 AND probability <= 1)),
  submitted_at  timestamptz NOT NULL DEFAULT now(),
  decided_at    timestamptz
);

-- Unique ignoring case, across every status: a name a person rejected stays taken until its owner picks another.
CREATE UNIQUE INDEX IF NOT EXISTS handle_lower_idx ON handles.handle (lower(handle));

-- The review queue, a table and not a service: one row for each handle in 'review', with why it is there. The reason is a class, never text from a
-- provider's answer. The row goes when a person decides or the player changes the handle.
CREATE TABLE IF NOT EXISTS handles.review_queue (
  handle_id   uuid        PRIMARY KEY REFERENCES handles.handle (handle_id) ON DELETE CASCADE,
  reason      text        NOT NULL CHECK (reason IN ('below-threshold', 'timeout', 'rate-limited', 'malformed', 'no-key', 'unavailable')),
  enqueued_at timestamptz NOT NULL DEFAULT now()
);

-- The contract the leaderboard reads (ADR-0012's pattern): approved handles and nothing else. trading_owner has no grant on any table here.
CREATE OR REPLACE VIEW handles.approved_v1 AS
  SELECT owner_user_id, handle
    FROM handles.handle
   WHERE status = 'approved';

GRANT USAGE ON SCHEMA handles TO trading_owner;
GRANT SELECT ON handles.approved_v1 TO trading_owner;
