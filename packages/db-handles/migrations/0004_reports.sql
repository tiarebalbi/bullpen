-- run-as: owner
-- ADR-0027, follow-up of 2026-11-10: a player can report another player's approved handle, and the admin can take an approved handle down. Ids only: a report is
-- (which handle, which reporter, when), with no text from the reporter and nothing else about them. The reporter is the same Neon Auth user id as in handles.handle.

-- A handle taken down after a report. 'revoked' is not 'approved', so handles.approved_v1 stops publishing it and the leaderboard shows the neutral label again at its next refresh.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'handles.handle'::regclass AND conname = 'handle_status_check' AND pg_get_constraintdef(oid) LIKE '%revoked%'
  ) THEN
    ALTER TABLE handles.handle DROP CONSTRAINT IF EXISTS handle_status_check;
    ALTER TABLE handles.handle ADD CONSTRAINT handle_status_check CHECK (status IN ('pending', 'approved', 'review', 'rejected', 'revoked'));
  END IF;
END
$$;

-- One row for each reporter and handle: reporting the same handle twice is one report. `dismissed_at` is the admin's "this is fine": the reporter's row stays (so they
-- still cannot report it again) and the handle leaves the Reported list until another player reports it. The rows of a handle go when the player changes it (a
-- report is about the text), when it is revoked, and with the handle.
CREATE TABLE IF NOT EXISTS handles.reports (
  report_id        bigserial   PRIMARY KEY,
  handle_id        uuid        NOT NULL REFERENCES handles.handle (handle_id) ON DELETE CASCADE,
  reporter_user_id text        NOT NULL,
  reported_at      timestamptz NOT NULL DEFAULT now(),
  dismissed_at     timestamptz,
  UNIQUE (handle_id, reporter_user_id)
);
CREATE INDEX IF NOT EXISTS reports_open_idx ON handles.reports (handle_id) WHERE dismissed_at IS NULL;

-- The handle texts that were taken down, kept after the player changes their handle: nobody can save one again, the player who had it or any other. Lower case, as the name is
-- unique ignoring case. The text and the time, and no player: a save is checked by the text alone, so who had it is not recorded here and cannot be said to anyone.
CREATE TABLE IF NOT EXISTS handles.revoked (
  handle_lower text        PRIMARY KEY,
  revoked_at   timestamptz NOT NULL DEFAULT now()
);
