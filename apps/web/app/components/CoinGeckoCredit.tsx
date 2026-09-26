import type { ReactNode } from "react";

/**
 * Required by CoinGecko's API Terms of Service (see ADR-0005 and
 * docs/data-sources.md): "Powered by CoinGecko" in a legible font no
 * smaller than 10px, linked to coingecko.com, placed close to the price it
 * credits. Rendered next to every price this app shows -- never omitted,
 * never resized below the minimum.
 */
export function CoinGeckoCredit(): ReactNode {
  return (
    <a
      href="https://www.coingecko.com/en/api"
      target="_blank"
      rel="noopener noreferrer"
      className="bp-coingecko-credit"
      style={{
        display: "inline-block",
        marginTop: 8,
        font: "600 11px/1.4 var(--font-body)",
        color: "var(--foreground-muted)",
        textDecoration: "none",
      }}
    >
      Powered by CoinGecko
    </a>
  );
}
