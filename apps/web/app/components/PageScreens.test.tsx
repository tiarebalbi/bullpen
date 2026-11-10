import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountScreen } from "./AccountScreen.js";
import { ReviewScreen } from "./ReviewScreen.js";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
const account = { label: "Player 4F2A", buyingPower: "1.00000000", reserved: "0.00000000", cash: "1.00000000", positionsValue: "0.00000000", equity: "100000.00000000", positions: [], orders: [], latestOrder: null, fills: [], asOf: "2026-10-20T10:00:00.000Z" };
const board = { rows: [{ accountId: "a", handle: "Player 4F2A", cash: "1", positionsValue: "0", equity: "100000", rank: 2 }], total: 9, asOf: "2026-10-20T10:00:00.000Z", ageMs: 0, stale: false, lastFailure: null, viewer: { accountId: "a", handle: null } };

function signedIn(): void {
  vi.stubGlobal("fetch", vi.fn((url: string) => (String(url).includes("/api/orders") ? json(account) : json(board))));
}
function signedOut(): void {
  vi.stubGlobal("fetch", vi.fn((url: string) => (String(url).includes("/api/orders") ? json({ error: "unauthenticated" }, 401) : json({ ...board, viewer: undefined }))));
}
beforeEach(() => signedOut());
afterEach(() => vi.unstubAllGlobals());

describe("the account screen", () => {
  it("sits in the terminal's frame: its header says Bullpen, the page's name and the toggles, and the content is in the main region", () => {
    const { container } = render(<AccountScreen player={null} own={null} unavailable={false} />);
    expect(container.querySelector(".bp-terminal.bp-page")).not.toBeNull();
    const header = container.querySelector("header.bp-terminal__header") as HTMLElement;
    expect(within(header).getByRole("heading", { level: 1, name: "Bullpen" })).toBeInTheDocument();
    expect(header).toHaveTextContent("Account");
    expect(screen.getByRole("main")).toContainElement(screen.getByRole("heading", { name: "Your account" }));
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("gives a visitor the same words as before, and nothing to edit", () => {
    render(<AccountScreen player={null} own={null} unavailable={false} />);
    expect(screen.getByText("Sign in with GitHub on the terminal to set a handle. Until you do, and until a handle is approved, you appear as “Player” and four characters.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to the terminal" })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("says in words that handles are unavailable, as an alert", () => {
    render(<AccountScreen player={{ label: "Player 4F2A" }} own={null} unavailable />);
    expect(screen.getByRole("alert")).toHaveTextContent("Handles are not available right now. Try again in a moment.");
  });

  it("draws the handle form with the design system's field: a labelled input on the 2px rule, small caps label, and a pill button", () => {
    render(<AccountScreen player={{ label: "Player 4F2A" }} own={{ handle: "bull_run", status: "review" }} unavailable={false} />);
    const input = screen.getByLabelText("Handle");
    expect(input).toHaveClass("bp-input");
    expect(input).toHaveValue("bull_run");
    expect(screen.getByText("Handle", { selector: "label" })).toHaveClass("bp-field__label");
    expect(screen.getByText(/3 to 20 letters, digits/)).toHaveClass("bp-field__help");
    expect(screen.getByRole("button", { name: "Save handle" })).toHaveClass("bp-btn--primary");
    expect(screen.getByText(/bull_run is in review\. It shows on the leaderboard once it’s approved\. Until then you appear as Player 4F2A\./)).toBeInTheDocument();
  });

  it("shows a signed-in player's equity, rank and chip in the header, as the terminal does", async () => {
    signedIn();
    const { container } = render(<AccountScreen player={{ label: "Player 4F2A" }} own={null} unavailable={false} />);
    const header = container.querySelector("header.bp-terminal__header") as HTMLElement;
    await waitFor(() => expect(header).toHaveTextContent("$100,000.00"));
    expect(header).toHaveTextContent("#2 of 9");
    expect(within(header).getByRole("img", { name: "Signed in as Player 4F2A" })).toBeInTheDocument();
  });

  it("shows a visitor the wordmark and toggles only: no equity, no rank, no chip", async () => {
    const { container } = render(<AccountScreen player={null} own={null} unavailable={false} />);
    const header = container.querySelector("header.bp-terminal__header") as HTMLElement;
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(header).not.toHaveTextContent("Equity");
    expect(header).not.toHaveTextContent("Rank");
    expect(within(header).queryByRole("img", { name: /Signed in as/ })).toBeNull();
  });
});

describe("the review screen", () => {
  const item = { handleId: "h1", handle: "bullrun99", probability: 0.62, reason: "below-threshold", enqueuedAt: "2026-10-20T14:05:00.000Z" };

  it("sits in the same frame, with the page's name in the header and its own heading in the page", () => {
    const { container } = render(<ReviewScreen queue={[item]} stuck={[]} reported={[]} stuckAfterMinutes={10} />);
    expect(container.querySelector(".bp-terminal.bp-page")).not.toBeNull();
    expect(container.querySelector("header.bp-terminal__header")).toHaveTextContent("Handle review");
    expect(container.querySelector("h2.bp-page__title")).toHaveTextContent("Handles in review");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("lists each handle with the model's number, as a row with its own actions", () => {
    render(<ReviewScreen queue={[item]} stuck={[]} reported={[]} stuckAfterMinutes={10} />);
    const row = screen.getByRole("list", { name: "Handles waiting for review" }).querySelector("li")!;
    expect(row).toHaveClass("bp-review__row");
    expect(row).toHaveTextContent("bullrun99");
    expect(row).toHaveTextContent("p = 0.620");
    expect(within(row).getByRole("button", { name: "Approve bullrun99" })).toHaveClass("bp-btn--secondary");
    expect(within(row).getByRole("button", { name: "Reject bullrun99" })).toHaveClass("bp-btn--destructive");
  });

  it("lists the reported handles with a count, and Dismiss and Revoke for each, and never who reported", () => {
    render(<ReviewScreen queue={[]} stuck={[]} reported={[{ handleId: "h5", handle: "loud_bull", reports: 3, firstReportedAt: "2026-10-20T12:00:00.000Z" }, { handleId: "h6", handle: "meme_lord", reports: 1, firstReportedAt: "2026-10-20T13:10:00.000Z" }]} stuckAfterMinutes={10} />);
    const list = screen.getByRole("list", { name: "Reported handles" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("loud_bull");
    expect(rows[0]).toHaveTextContent("3 reports");
    expect(rows[1]).toHaveTextContent("1 report");
    expect(rows[1]).not.toHaveTextContent("1 reports");
    expect(within(rows[0]!).getByRole("button", { name: "Revoke loud_bull" })).toHaveClass("bp-btn--destructive");
    expect(within(rows[0]!).getByRole("button", { name: "Dismiss reports of loud_bull" })).toHaveClass("bp-btn--secondary");
    expect(list.textContent).not.toMatch(/reporter|user/i);
  });

  it("says in words that nothing is reported, rather than showing nothing", () => {
    render(<ReviewScreen queue={[]} stuck={[]} reported={[]} stuckAfterMinutes={10} />);
    expect(screen.getByText("Nothing reported")).toBeInTheDocument();
  });

  it("says it cannot read the queue, as an alert, when the reported list alone cannot be read", () => {
    render(<ReviewScreen queue={[item]} stuck={[]} reported={null} stuckAfterMinutes={10} />);
    expect(screen.getByRole("alert")).toHaveTextContent("I cannot read the review queue right now.");
  });

  it("says it cannot read the queue, as an alert, rather than showing an empty one", () => {
    render(<ReviewScreen queue={null} stuck={null} reported={null} stuckAfterMinutes={10} />);
    expect(screen.getByRole("alert")).toHaveTextContent("I cannot read the review queue right now.");
    expect(screen.queryByText("Nothing to review")).toBeNull();
  });
});
