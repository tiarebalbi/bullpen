import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReviewList, probabilityLabel } from "./ReviewList.js";

afterEach(() => vi.unstubAllGlobals());
const items = [
  { handleId: "0b9b1a1e-6d5c-4a5e-9b0c-6a2f4f6d9f11", handle: "BullRun", probability: 0.42, reason: "below-threshold", enqueuedAt: "2026-11-02T10:00:00.000Z" },
  { handleId: "1c9b1a1e-6d5c-4a5e-9b0c-6a2f4f6d9f22", handle: "OtherOne", probability: null, reason: "timeout", enqueuedAt: "2026-11-02T10:01:00.000Z" },
];

describe("the review list", () => {
  it("shows each handle with the model's probability or why there is none", () => {
    render(<ReviewList items={items} />);
    expect(screen.getByText("p = 0.420")).toBeInTheDocument();
    expect(screen.getByText("no probability")).toBeInTheDocument();
    expect(screen.getByText("(the model took too long)")).toBeInTheDocument();
    expect(probabilityLabel(1)).toBe("p = 1.000");
  });

  it("posts the decision and removes the handle", async () => {
    const fetcher = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    render(<ReviewList items={items} />);
    fireEvent.click(screen.getByRole("button", { name: "Reject BullRun" }));
    await waitFor(() => expect(screen.queryByText("BullRun")).toBeNull());
    expect(fetcher).toHaveBeenCalledWith(`/api/admin/handles/${items[0]!.handleId}`, expect.objectContaining({ method: "POST", body: JSON.stringify({ action: "reject" }) }));
  });

  it("keeps the handle and says so when the decision fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 })));
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
