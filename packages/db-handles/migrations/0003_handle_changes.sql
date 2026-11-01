-- run-as: owner
-- ADR-0027: a player may change a handle at most five times in 24 hours. Every save is one row here, so the limit is counted before any model is asked; rows
-- older than the window are deleted as they are passed. The user id is the same Neon Auth id as in handles.handle, and nothing else about the player is kept.
CREATE TABLE IF NOT EXISTS handles.handle_changes (
  change_id     bigserial   PRIMARY KEY,
  owner_user_id text        NOT NULL,
  changed_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS handle_changes_owner_idx ON handles.handle_changes (owner_user_id, changed_at);
