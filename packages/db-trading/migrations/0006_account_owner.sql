-- run-as: owner
-- A player's account belongs to the user Neon Auth knows (ADR-0020). The id is Neon Auth's, kept as text: Bullpen stores no name, email or sign-in login.
ALTER TABLE trading.accounts ADD COLUMN IF NOT EXISTS owner_user_id text;
CREATE UNIQUE INDEX IF NOT EXISTS accounts_owner_user_id_idx ON trading.accounts (owner_user_id) WHERE owner_user_id IS NOT NULL;
