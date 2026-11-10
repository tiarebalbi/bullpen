import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HandleForm, statusLine } from "./HandleForm.js";

afterEach(() => vi.unstubAllGlobals());
const reply = (status: number, body: unknown) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
const save = (text: string) => {
  fireEvent.change(screen.getByLabelText("Handle"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Save handle" }));
};

describe("what the player is told", () => {
  it("never calls a pending, review or rejected handle public", () => {
    expect(statusLine(null, "Player 4F2A")).toContain("Player 4F2A");
    expect(statusLine({ handle: "BullRun", status: "pending" }, "Player 4F2A")).toContain("Until then you appear as Player 4F2A");
    expect(statusLine({ handle: "BullRun", status: "review" }, "Player 4F2A")).toContain("Until then you appear as Player 4F2A");
  });

  it("says a handle in review shows on the leaderboard once it is approved, and promises no time", () => {
    const review = statusLine({ handle: "BullRun", status: "review" }, "Player 4F2A");
    expect(review).toContain("It shows on the leaderboard once it’s approved.");
    expect(statusLine({ handle: "BullRun", status: "pending" }, "Player 4F2A")).toContain("It shows on the leaderboard once it’s approved.");
    for (const status of ["pending", "review"] as const) {
      expect(statusLine({ handle: "BullRun", status }, "Player 4F2A")).not.toMatch(/minute|hour|day|soon|shortly|within|refresh/i);
    }
  });

  it("keeps the other statuses as they were", () => {
    expect(statusLine({ handle: "BullRun", status: "rejected" }, "Player 4F2A")).toBe("BullRun was not approved, so you appear as Player 4F2A. Choose another.");
    expect(statusLine({ handle: "BullRun", status: "approved" }, "Player 4F2A")).toContain("is approved");
  });
});

describe("the handle form", () => {
  it("shows a rule's error as a form error", async () => {
    reply(400, { error: "invalid-handle", message: "A handle is 3 to 20 characters." });
    render(<HandleForm initial={null} label="Player 4F2A" />);
    save("ab");
    expect((await screen.findByRole("alert")).textContent).toBe("A handle is 3 to 20 characters.");
  });

  it("tells the player a taken name is taken", async () => {
    reply(409, { error: "handle-taken", message: "Someone already has that handle. Try another." });
    render(<HandleForm initial={null} label="Player 4F2A" />);
    save("BullRun");
    expect((await screen.findByRole("alert")).textContent).toContain("already has that handle");
  });

  it("says a handle in review is waiting, and keeps the neutral label", async () => {
    reply(200, { status: "review" });
    render(<HandleForm initial={null} label="Player 4F2A" />);
    save("BullRun");
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Saved. It shows on the leaderboard once it’s approved."));
    expect(screen.getByText(/is in review/).textContent).toContain("Player 4F2A");
    expect(screen.getByRole("status").textContent).not.toMatch(/minute|hour|day|soon|shortly|within/i);
  });

  it("says when it could not reach the server", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    render(<HandleForm initial={null} label="Player 4F2A" />);
    save("BullRun");
    expect((await screen.findByRole("alert")).textContent).toContain("could not reach");
  });
});
