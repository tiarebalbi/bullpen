import { describe, expect, it } from "vitest";
import { configProblems, SWEEP_PATH } from "./config.ts";

const GOOD = `https://bullpen-app.example.test${SWEEP_PATH}`;

describe("configProblems", () => {
  it("accepts the sweep route's https URL with a token", () => {
    expect(configProblems(GOOD, "t")).toEqual([]);
  });

  it("accepts plain http only for the machine's own addresses", () => {
    expect(configProblems(`http://127.0.0.1:3198${SWEEP_PATH}`, "t")).toEqual([]);
    expect(configProblems(`http://host.docker.internal:3198${SWEEP_PATH}`, "t")).toEqual([]);
    expect(configProblems(`http://bullpen-app.example.test${SWEEP_PATH}`, "t")).toEqual(["SWEEPER_TARGET_URL must be an https URL"]);
  });

  it("names a URL that stops at the origin or ends at another route: the 405 that nothing else explained", () => {
    expect(configProblems("https://bullpen-app.example.test", "t")).toEqual([`SWEEPER_TARGET_URL must end at ${SWEEP_PATH}, not at "/"`]);
    expect(configProblems("https://bullpen-app.example.test/api/orders", "t")).toEqual([`SWEEPER_TARGET_URL must end at ${SWEEP_PATH}, not at "/api/orders"`]);
    expect(configProblems(`${GOOD}/`, "t")).toHaveLength(1);
  });

  it("reports each missing variable by name, and a value that is not a URL", () => {
    expect(configProblems(undefined, undefined)).toEqual(["SWEEPER_TOKEN is not set", "SWEEPER_TARGET_URL is not set"]);
    expect(configProblems("not a url", "t")).toEqual(["SWEEPER_TARGET_URL is not a URL"]);
  });

  it("refuses credentials in the URL, and never repeats the URL's secrets or the token", () => {
    const problems = configProblems(`https://user:hunter2@bullpen-app.example.test${SWEEP_PATH}?key=abc`, "TOKEN-VALUE");
    expect(problems).toEqual(["SWEEPER_TARGET_URL must not carry credentials; the token is SWEEPER_TOKEN"]);
    expect(JSON.stringify(configProblems("https://x.test/p?key=abc#frag", "TOKEN-VALUE"))).not.toMatch(/abc|frag|TOKEN-VALUE/);
  });
});
