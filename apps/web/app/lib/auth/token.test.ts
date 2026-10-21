import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { verifyAccessToken } from "./token.js";

// A fake signing key made for this test: stands in for the Neon Auth project's key, so no real token or secret is involved.
let signing: Awaited<ReturnType<typeof generateKeyPair>>;
let other: Awaited<ReturnType<typeof generateKeyPair>>;
let keys: ReturnType<typeof createLocalJWKSet>;

const sign = (key: CryptoKey, claims: Record<string, unknown>, options: { exp?: string | number | null; kid?: string; alg?: string } = {}) => {
  const jwt = new SignJWT(claims).setProtectedHeader({ alg: options.alg ?? "ES256", kid: options.kid ?? "test-key" }).setIssuedAt();
  if (options.exp !== null) jwt.setExpirationTime(options.exp ?? "10m");
  return jwt.sign(key);
};

beforeAll(async () => {
  signing = await generateKeyPair("ES256");
  other = await generateKeyPair("ES256");
  const jwk: JWK = { ...(await exportJWK(signing.publicKey)), kid: "test-key", alg: "ES256", use: "sig" };
  keys = createLocalJWKSet({ keys: [jwk] });
});

describe("verifyAccessToken", () => {
  it("returns the user a valid, unexpired token is for", async () => {
    const token = await sign(signing.privateKey, { sub: "user-123", role: "authenticated" });
    expect(await verifyAccessToken(token, keys)).toEqual({ userId: "user-123" });
  });

  it("refuses a token signed with another key, even under the same key id", async () => {
    const token = await sign(other.privateKey, { sub: "user-123" });
    expect(await verifyAccessToken(token, keys)).toBeNull();
  });

  it("refuses an expired token", async () => {
    const token = await sign(signing.privateKey, { sub: "user-123" }, { exp: Math.floor(Date.now() / 1000) - 3600 });
    expect(await verifyAccessToken(token, keys)).toBeNull();
  });

  it("refuses a token with no expiry or no subject", async () => {
    expect(await verifyAccessToken(await sign(signing.privateKey, { sub: "user-123" }, { exp: null }), keys)).toBeNull();
    expect(await verifyAccessToken(await sign(signing.privateKey, { role: "authenticated" }), keys)).toBeNull();
    expect(await verifyAccessToken(await sign(signing.privateKey, { sub: "" }), keys)).toBeNull();
  });

  it("refuses a token whose payload was changed after signing", async () => {
    const token = await sign(signing.privateKey, { sub: "user-123" });
    const [header, , signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "someone-else", exp: Math.floor(Date.now() / 1000) + 600 })).toString("base64url");
    expect(await verifyAccessToken(`${header}.${forged}.${signature}`, keys)).toBeNull();
  });

  it("refuses an unsigned token, an empty string and garbage, without throwing", async () => {
    const unsigned = `${Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: "user-123", exp: 9999999999 })).toString("base64url")}.`;
    for (const token of [unsigned, "", "not-a-token", "a.b.c"]) expect(await verifyAccessToken(token, keys)).toBeNull();
  });

  it("refuses a token for a key id the project does not publish", async () => {
    const token = await sign(signing.privateKey, { sub: "user-123" }, { kid: "unknown-key" });
    expect(await verifyAccessToken(token, keys)).toBeNull();
  });
});
