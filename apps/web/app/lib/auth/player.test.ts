import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { neutralHandle } from "@bullpen/db-trading";
import { currentPlayer, type PlayerDeps } from "./player.js";

let privateKey: CryptoKey;
let deps: (session: unknown) => PlayerDeps;

const token = (claims: Record<string, unknown>) => new SignJWT(claims).setProtectedHeader({ alg: "ES256", kid: "k" }).setIssuedAt().setExpirationTime("10m").sign(privateKey);

beforeAll(async () => {
  const pair = await generateKeyPair("ES256");
  privateKey = pair.privateKey;
  const keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: "k", alg: "ES256" }] });
  deps = (session) => ({ getSession: async () => ({ data: session as never }), keys: () => keys });
});

describe("currentPlayer", () => {
  it("is the verified user, with the neutral label and nothing else about them", async () => {
    // The session carries a name, an email and a login, as a real one does; none of it may come out.
    const session = { access_token: await token({ sub: "user-abc", name: "Ada Lovelace", email: "ada@example.org", login: "ada-gh" }), user: { id: "user-abc", name: "Ada Lovelace", email: "ada@example.org" } };
    const player = await currentPlayer(deps({ session, user: session.user }));
    expect(player).toEqual({ userId: "user-abc", label: neutralHandle("user-abc") });
    expect(player!.label).toMatch(/^Player [0-9A-F]{4}$/);
    expect(JSON.stringify(player)).not.toMatch(/Ada|Lovelace|ada@example|ada-gh/);
  });

  it("is null with no session, with a session that has no token, and when the session call fails", async () => {
    expect(await currentPlayer(deps(null))).toBeNull();
    expect(await currentPlayer(deps({ session: {} }))).toBeNull();
    expect(await currentPlayer({ getSession: async () => Promise.reject(new Error("upstream down")), keys: deps(null).keys })).toBeNull();
  });

  it("is null when the token in the session does not verify: a cookie that is merely present is not a player", async () => {
    expect(await currentPlayer(deps({ session: { access_token: "eyJhbGciOiJub25lIn0.eyJzdWIiOiJ1c2VyLWFiYyJ9." } }))).toBeNull();
    const other = await generateKeyPair("ES256");
    const forged = await new SignJWT({ sub: "user-abc" }).setProtectedHeader({ alg: "ES256", kid: "k" }).setExpirationTime("10m").sign(other.privateKey);
    expect(await currentPlayer(deps({ session: { access_token: forged } }))).toBeNull();
  });
});
