# ADR-0020: Sign-in is Neon's managed auth, GitHub only

## Status

Accepted

## Date

2026-10-21

## Summary

GitHub sign-in through Neon, players shown as "Player ####"

## Part

4

## Context

Placing an order needs a player, and a player needs an account that outlives a visit. Part 4 adds sign-in only as far as that: it is not part
of the architecture argument. The choice I proposed on 2026-10-20 was a self-hosted Better Auth in its own `auth` schema with its own role. I
chose Neon's managed version instead, which is already enabled on the production branch with GitHub as its provider and
`bullpen-app.tiarebalbi.com` as a trusted domain.

## Decision

Sign-in uses Neon's managed auth with GitHub as the only provider, and a player is only ever a neutral label.

- **Neon's managed auth, with GitHub as the only provider.** No email provider, no password sign-up on the player's side. The Neon SDK
  (`@neondatabase/auth`, pinned at the version the quickstart installs, a beta) runs the sign-in proxy at `/api/auth/*` and the server
  session; nothing about sign-in lives in Bullpen's database apart from the user's id.
- **Identity is a verified token.** The session holds an access token. The trading app checks it against the project's public keys
  (`<auth URL>/.well-known/jwks.json`, with `jose`) and takes the user id from its `sub` claim; a cookie that is merely present is not a player.
  The tests sign tokens with a key made for the test and give the verifier that key's public half.
- **A player is a neutral label.** A GitHub username is not a public handle. The account's handle is `Player` and four hex characters of a hash of
  the user id (more characters when four are taken). Name, email and login are never stored or shown. Handles proper are later work.
- **One account per user.** `trading.accounts.owner_user_id` holds the Neon Auth user id (unique). First sign-in makes the account with
  100,000 in play money, a named constant (`STARTING_CASH`); every later sign-in finds the same one, also under concurrent sign-ins.
- **No sign-in on previews.** A preview's address changes with every deployment and is not a trusted domain; the proxy answers 404 and the
  ticket says so.
- **Two settings, read in one place.** `NEON_AUTH_BASE_URL` and `NEON_AUTH_COOKIE_SECRET` are read only by `apps/web/app/lib/auth`
  (ADL rules). Neither is set by this change; both are set in Vercel production by the owner.
- The model names Neon's auth as an external system, and `docs/data-sources.md` lists it as in use, because it is enabled today; this ADR
  records the choice, and the owner accepted it on 2026-10-21.

## Consequences

- No self-hosted auth tables, no extra role and no migration for auth. One column on `trading.accounts` and no personal data in Bullpen's database.
- Sign-in depends on a beta SDK and on Neon's service. If it is down, the ticket says sign-in is unavailable and the rest of the app, which reads
  public prices and the leaderboard, still works.
- Left for the owner, in the Neon console, before this is called ready: turn off "Allow Localhost" for production, and confirm email and password
  sign-up is off so that GitHub is the only way in. The code cannot check either.
- What Neon Auth costs on this plan is not read here: it is a line for the cost ledger when the console is read.
- GitHub's OAuth app takes one callback URL, so local development needs its own app and previews have no sign-in.

## Alternatives

- **Self-hosted Better Auth in an `auth` schema with its own role** — the earlier proposal. More secrets, a new role, a migration and a second reader of
  a database URL; rejected for the managed one that is already running.
- **Clerk** — a new vendor and a new integration, for a part of the system that is not the argument.
- **Auth.js** — lighter, but its current major version is a beta and it would still need session storage and the OAuth app.

## Links

- ADR-0012 (schema and role per owner) — why no auth role was added.
- ADR-0017 (the order lifecycle) — what the account is for.
- Neon's quickstart for Next.js (read 2026-10-21) and its page on verifying a token against the project's JWKS.
