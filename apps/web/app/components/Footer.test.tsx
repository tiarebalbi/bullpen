import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Footer } from "./Footer.js";

describe("Footer", () => {
  it("credits both data sources and says stocks are end of day, without promising a part", () => {
    render(<Footer />);
    const text = screen.getByRole("contentinfo").textContent ?? "";

    expect(text).toContain("BTC-USD price via CoinGecko");
    expect(text).toContain("U.S. stocks end of day via Alpha Vantage");
    expect(text).not.toMatch(/arrive in Part|from Part/i);
  });
});
