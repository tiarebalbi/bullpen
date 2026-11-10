import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportAction, isChosenHandle } from "./ReportAction.js";

afterEach(() => vi.unstubAllGlobals());
const reply = (status: number, body: unknown = {}) => {
  const fetcher = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
};

describe("which names can be reported", () => {
  it("a handle a player chose, never the neutral label", () => {
    expect(isChosenHandle("bull_run")).toBe(true);
    expect(isChosenHandle("a-b_9")).toBe(true);
    expect(isChosenHandle("Player 4F2A")).toBe(false);
    expect(isChosenHandle("ab")).toBe(false);
    expect(isChosenHandle("a".repeat(21))).toBe(false);
  });
});

describe("the report action", () => {
  it("asks once, then sends the name as shown and nothing else, and says a person will look", async () => {
    const fetcher = reply(200, { ok: true });
    render(<ReportAction handle="bull_run" />);
    expect(fetcher).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Report bull_run" }));
    expect(screen.getByText("Report bull_run?")).toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled(); // the first click only asks
    fireEvent.click(screen.getByRole("button", { name: "Yes, report" }));
    await screen.findByRole("status");
    expect(screen.getByRole("status")).toHaveTextContent("Reported. A person will look.");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith("/api/handle/report", expect.objectContaining({ method: "POST", body: JSON.stringify({ handle: "bull_run" }) }));
    expect(screen.queryByRole("button", { name: /Report bull_run/ })).toBeNull(); // once per player and handle: no second button
  });

  it("can be cancelled without sending anything", () => {
    const fetcher = reply(200);
    render(<ReportAction handle="bull_run" />);
    fireEvent.click(screen.getByRole("button", { name: "Report bull_run" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Report bull_run" })).toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    [409, { error: "already-reported", message: "You have already reported that handle." }],
    [404, { error: "not-found", message: "That handle is not shown on the leaderboard any more." }],
    [401, { error: "sign-in-required", message: "Sign in with GitHub to set a handle." }],
  ])("says the server's words when it answers %s, and offers the report again", async (status, body) => {
    reply(status, body);
    render(<ReportAction handle="bull_run" />);
    fireEvent.click(screen.getByRole("button", { name: "Report bull_run" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, report" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(body.message));
    expect(screen.getByRole("button", { name: "Report bull_run" })).toBeInTheDocument();
  });

  it("says it could not reach the server when the request fails, with no handle in the words", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))));
    render(<ReportAction handle="bull_run" />);
    fireEvent.click(screen.getByRole("button", { name: "Report bull_run" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, report" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("I could not reach the server. Try again in a moment."));
  });
});
