import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const { ReviewList, ageLabel, probabilityLabel } = await import("./ReviewList.js");

beforeEach(() => refresh.mockReset());
afterEach(() => vi.unstubAllGlobals());
const items = [
  { handleId: "0b9b1a1e-6d5c-4a5e-9b0c-6a2f4f6d9f11", handle: "BullRun", probability: 0.42, reason: "below-threshold", enqueuedAt: "2026-11-02T10:00:00.000Z" },
  { handleId: "1c9b1a1e-6d5c-4a5e-9b0c-6a2f4f6d9f22", handle: "OtherOne", probability: null, reason: "timeout", enqueuedAt: "2026-11-02T10:01:00.000Z" },
];
const stuck = [{ handleId: "2d9b1a1e-6d5c-4a5e-9b0c-6a2f4f6d9f33", handle: "StuckOne", submittedAt: "2026-11-02T09:00:00.000Z" }];
const reply = (status = 200) => {
  const fetcher = vi.fn(async () => new Response("{}", { status }));
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
};

describe("the review list", () => {
  it("shows each handle with the model's probability or why there is none", () => {
    render(<ReviewList items={items} />);
    expect(screen.getByText("p = 0.420")).toBeInTheDocument();
    expect(screen.getByText("no probability")).toBeInTheDocument();
    expect(screen.getByText("(the model took too long)")).toBeInTheDocument();
    expect(probabilityLabel(1)).toBe("p = 1.000");
  });

  it("posts the decision and removes the handle", async () => {
    const fetcher = reply();
    render(<ReviewList items={items} />);
    fireEvent.click(screen.getByRole("button", { name: "Reject BullRun" }));
    await waitFor(() => expect(screen.queryByText("BullRun")).toBeNull());
    expect(fetcher).toHaveBeenCalledWith(`/api/admin/handles/${items[0]!.handleId}`, expect.objectContaining({ method: "POST", body: JSON.stringify({ action: "reject" }) }));
  });

  it("keeps the handle and says so when the decision fails", async () => {
    reply(503);
    render(<ReviewList items={items} />);
    fireEvent.click(screen.getByRole("button", { name: "Approve BullRun" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("BullRun")).toBeInTheDocument();
  });

  it("shows the empty state when nothing waits", () => {
    render(<ReviewList items={[]} />);
    expect(screen.getByText("Nothing to review")).toBeInTheDocument();
  });
});

describe("the stuck pending section", () => {
  it("is its own section, saying how long a handle has been pending and what retry does", () => {
    render(<ReviewList items={items} stuck={stuck} stuckAfterMinutes={10} />);
    const section = screen.getByRole("region", { name: "Stuck pending" });
    expect(within(section).getByText("StuckOne")).toBeInTheDocument();
    expect(within(section).getByText(/pending for \d+ (minutes|hours)/)).toBeInTheDocument();
    expect(within(section).getByText(/more than 10 minutes ago/)).toBeInTheDocument();
    expect(within(section).getByText(/Retry asks the model again/)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Handles in review" })).not.toContainElement(screen.getByText("StuckOne"));
  });

  it("offers approve, reject and retry for each, and each posts its own action", async () => {
    const fetcher = reply();
    render(<ReviewList items={[]} stuck={stuck} />);
    for (const action of ["approve", "reject"]) {
      fireEvent.click(screen.getByRole("button", { name: `${action[0]!.toUpperCase()}${action.slice(1)} StuckOne` }));
      await waitFor(() => expect(fetcher).toHaveBeenLastCalledWith(`/api/admin/handles/${stuck[0]!.handleId}`, expect.objectContaining({ body: JSON.stringify({ action }) })));
      render(<ReviewList items={[]} stuck={stuck} />);
    }
    fireEvent.click(screen.getAllByRole("button", { name: "Retry StuckOne" })[0]!);
    await waitFor(() => expect(fetcher).toHaveBeenLastCalledWith(`/api/admin/handles/${stuck[0]!.handleId}`, expect.objectContaining({ body: JSON.stringify({ action: "retry" }) })));
  });

  it("removes a retried handle and asks the server for the lists again, since the retry may have put it in review", async () => {
    reply();
    render(<ReviewList items={[]} stuck={stuck} />);
    fireEvent.click(screen.getByRole("button", { name: "Retry StuckOne" }));
    await waitFor(() => expect(screen.queryByText("StuckOne")).toBeNull());
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("keeps a stuck handle and says so when the action fails, and does not refresh", async () => {
    reply(503);
    render(<ReviewList items={[]} stuck={stuck} />);
    fireEvent.click(screen.getByRole("button", { name: "Retry StuckOne" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("StuckOne")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows an empty state when none is stuck", () => {
    render(<ReviewList items={[]} stuck={[]} />);
    expect(screen.getByText("Nothing stuck")).toBeInTheDocument();
  });

  it("says ages in plain words", () => {
    const now = new Date("2026-11-02T12:00:00Z");
    expect(ageLabel("2026-11-02T11:48:00Z", now)).toBe("12 minutes");
    expect(ageLabel("2026-11-02T09:00:00Z", now)).toBe("3 hours");
  });
});
