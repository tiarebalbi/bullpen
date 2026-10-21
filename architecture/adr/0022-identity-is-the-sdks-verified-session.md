# ADR-0022: Identity is the Neon Auth SDK's verified session

## Status

Accepted

## Date

2026-10-21

## Summary

The player id comes from the SDK's own session check

## Part

4

## Context

ADR-0020 said the session holds an access token, that the trading app checks it against the project's JWKS with `jose`, and that a cookie that is
merely present is not a player. In production sign-in worked and every authenticated request returned 401. The browser held two cookies; the larger
(`__Secure-neon-auth.local.session_data`, 1290 bytes) is a JWT with the header `{"alg":"HS256","typ":"JWT"}`, a 300-second lifetime and the payload
`{ session, user: { id, name, email, image, … }, sub }`. It is the SDK's session cache, signed with `NEON_AUTH_COOKIE_SECRET`. It holds no access token,
and nothing in `@neondatabase/auth` 0.6.0-beta reads `session.access_token` from it. So the app found no token, and a JWKS check could never have
passed: those keys sign access tokens, not this cookie. The tests passed because they signed an ES256 token with a key made for the test and handed
the verifier its public half, a format the SDK never writes.

## Decision

The player is the user in the session the Neon Auth SDK has already verified, and the app checks nothing a second time.

- **The user id is `session.user.id` from the SDK's server `getSession()`.** The SDK has already verified what this reads: the `session_data`
  cookie's HS256 signature and expiry against the cookie secret, or, with no valid cache, the session token with Neon Auth itself. The app does not
  verify a second time, and `token.ts` (the JWKS check) is removed.
- **The rule that a cookie merely present is not a player stands.** It is kept by the SDK's check, and the tests now use the SDK's own cookie: they
  mint it with the SDK's `handleAuthProxyRequest` and read it back through the real `createNeonAuth().getSession()`.
- **The privacy rule is unchanged.** The session carries name, email and image; only the id is read, and only the "Player ####" label leaves the server.
  A test signs in with a session that carries all three and checks the `/api/orders` answers and the player object for them.
- Access tokens (`getAccessToken`, the JWKS) are for calling a service that checks them, such as a Neon data API. Bullpen has no such service.

## Consequences

- The trust anchor is `NEON_AUTH_COOKIE_SECRET`, which was already required and is read only in `apps/web/app/lib/auth`. A leak of the secret would
  allow forged sessions; it was already the key to the session cookies.
- A session revoked at Neon Auth is still accepted until its cache cookie expires, at most 300 seconds. That is the SDK's own trade-off.
- `jose` is no longer a direct dependency of the web app.
- Supersedes only the "Identity is a verified token" bullet of ADR-0020, which is not edited.

## Alternatives

- **Fetch an access token with `getAccessToken()` and verify it against the JWKS.** An extra round trip to Neon Auth on every request, a JWKS fetch and
  key cache to keep, and a second verification of a session the SDK has already verified, for no service that needs the token.
- **Decode the cookie ourselves with the secret.** The same check the SDK already does, written again against a cookie format it does not promise.

## Links

- ADR-0020 (sign-in is Neon's managed auth) — the bullet this supersedes.
