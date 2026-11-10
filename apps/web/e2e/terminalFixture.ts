import type { Page } from "@playwright/test";

// One signed-in account with a long history, answered at the browser network layer (a fixture, never a page's data): two open orders, many finished ones, fills of a stock
// in parts, a crypto fill with decimals, and positions to hold. The terminal-design spec and the before/after screenshots read it.
const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });
const T = (minutesAgo: number) => new Date(Date.UTC(2026, 9, 20, 15, 30) - minutesAgo * 60_000).toISOString();

interface Spec {
  symbol: string;
  quantity: string;
  state: "working" | "partially_filled" | "filled" | "cancelled" | "rejected";
  filled?: string;
  price?: string;
  minutesAgo: number;
}

const SPECS: Spec[] = [
  { symbol: "AAPL", quantity: "10", state: "working", minutesAgo: 2 },
  { symbol: "MSFT", quantity: "50", state: "partially_filled", filled: "20", price: "512.38", minutesAgo: 9 },
  { symbol: "GOOGL", quantity: "200", state: "filled", filled: "200", price: "196.11", minutesAgo: 25 },
  { symbol: "BTC-USD", quantity: "0.25", state: "filled", filled: "0.25", price: "108900", minutesAgo: 40 },
  { symbol: "NVDA", quantity: "40", state: "filled", filled: "40", price: "176.2", minutesAgo: 70 },
  { symbol: "TSLA", quantity: "15", state: "cancelled", filled: "0", minutesAgo: 95 },
  { symbol: "AAPL", quantity: "20", state: "filled", filled: "20", price: "236.1", minutesAgo: 130 },
  { symbol: "SPY", quantity: "5", state: "rejected", filled: "0", minutesAgo: 160 },
  { symbol: "NVDA", quantity: "12", state: "filled", filled: "12", price: "175.9", minutesAgo: 200 },
  { symbol: "MSFT", quantity: "8", state: "filled", filled: "8", price: "510.1", minutesAgo: 260 },
  { symbol: "AAPL", quantity: "30", state: "cancelled", filled: "10", price: "235.2", minutesAgo: 320 },
  { symbol: "GOOGL", quantity: "25", state: "filled", filled: "25", price: "195.4", minutesAgo: 400 },
  { symbol: "TSLA", quantity: "6", state: "filled", filled: "6", price: "348.57", minutesAgo: 480 },
  { symbol: "NVDA", quantity: "3", state: "filled", filled: "3", price: "174.8", minutesAgo: 600 },
];

const eight = (n: string | number): string => Number(n).toFixed(8);

const num = (value: string | undefined): number => (value === undefined ? 0 : Number(value));
const isOpen = (spec: Spec): boolean => spec.state === "working" || spec.state === "partially_filled";

/** What the order has filled, cancelled and left open, as the lifecycle states them. */
function quantities(spec: Spec) {
  const filled = num(spec.filled);
  const total = Number(spec.quantity);
  const left = total - filled;
  const open = isOpen(spec) ? left : 0;
  const cancelled = spec.state === "cancelled" ? left : 0;
  return { quantity: eight(total), filledQty: eight(filled), openQty: eight(open), cancelledQty: eight(cancelled) };
}

/** What the order cost and what is still held or has come back. */
function money(spec: Spec) {
  const open = isOpen(spec);
  const reserved = open ? 2000 : 0;
  const released = open ? 0 : 50;
  const spent = num(spec.filled) * num(spec.price);
  const avgPrice = spec.price ? eight(spec.price) : null;
  return { avgPrice, capPrice: eight(999), reserved: eight(reserved), spent: eight(spent), released: eight(released), releaseDone: !open };
}

function order(spec: Spec, index: number) {
  const orderId = `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
  const cancelRequestedAt = spec.state === "cancelled" ? T(spec.minutesAgo - 1) : null;
  return { orderId, symbol: spec.symbol, side: "buy", type: "market", state: spec.state, ...quantities(spec), ...money(spec), needsAttention: null, createdAt: T(spec.minutesAgo), cancelRequestedAt };
}

/** The 200-share GOOGL order filled in two parts, as the old simulator did (116.83359884 + 83.16640116), and the rest whole. */
const FILLS = [
  { fillId: "f1", symbol: "AAPL", quantity: "20.00000000", price: "236.10000000", minutesAgo: 130 },
  { fillId: "f2", symbol: "GOOGL", quantity: "116.83359884", price: "196.11000000", minutesAgo: 25 },
  { fillId: "f3", symbol: "GOOGL", quantity: "83.16640116", price: "196.11000000", minutesAgo: 24 },
  { fillId: "f4", symbol: "BTC-USD", quantity: "0.25000000", price: "108900.00000000", minutesAgo: 40 },
  { fillId: "f5", symbol: "NVDA", quantity: "40.00000000", price: "176.20000000", minutesAgo: 70 },
  { fillId: "f6", symbol: "MSFT", quantity: "20.00000000", price: "512.38000000", minutesAgo: 9 },
  { fillId: "f7", symbol: "NVDA", quantity: "12.00000000", price: "175.90000000", minutesAgo: 200 },
  { fillId: "f8", symbol: "MSFT", quantity: "8.00000000", price: "510.10000000", minutesAgo: 260 },
  { fillId: "f9", symbol: "TSLA", quantity: "6.00000000", price: "348.57000000", minutesAgo: 480 },
  { fillId: "f10", symbol: "AAPL", quantity: "10.00000000", price: "235.20000000", minutesAgo: 320 },
];

export function heavyAccount() {
  const orders = SPECS.map(order);
  return {
    label: "Player 4F2A", buyingPower: "41358.12000000", reserved: "2000.00000000", cash: "43358.12000000", positionsValue: "92000.00000000", equity: "135358.12000000",
    positions: [
      { symbol: "GOOGL", quantity: "225.00000000", avgCost: "196.0", price: "198.10", value: "44572.50" },
      { symbol: "NVDA", quantity: "55.00000000", avgCost: "176.0", price: "182.58", value: "10041.90" },
      { symbol: "AAPL", quantity: "30.00000000", avgCost: "236.1", price: "241.20", value: "7236.00" },
      { symbol: "BTC-USD", quantity: "0.25000000", avgCost: "108900", price: "112506.76", value: "28126.69" },
    ],
    orders, latestOrder: { orderId: orders[0]!.orderId, events: [{ kind: "accepted", at: T(2), state: "accepted", quantity: "10.00000000", price: null }, { kind: "working", at: T(2), state: "working", quantity: null, price: null }] },
    fills: FILLS.map((f) => ({ fillId: f.fillId, symbol: f.symbol, side: "buy", quantity: f.quantity, price: f.price, executedAt: T(f.minutesAgo) })), asOf: new Date().toISOString(),
  };
}

export async function mockHeavyTerminal(page: Page): Promise<void> {
  const stockRow = (symbol: string, price: string, previous: string) => ({ symbol, price, asOf: "2026-10-19T20:00:00.000Z", stale: false, previousClose: { price: previous, asOf: "2026-10-16T20:00:00.000Z" } });
  await page.route("**/api/orders", (r) => r.fulfill(json(heavyAccount())));
  await page.route("**/api/price/BTC-USD", (r) => r.fulfill(json({ symbol: "BTC-USD", price: 112506.76, changePercent: 1.48, time: new Date().toISOString(), source: "coingecko", fetchedAt: new Date().toISOString() })));
  await page.route("**/api/stock-prices", (r) =>
    r.fulfill(json({ rows: [stockRow("AAPL", "241.20", "238.0"), stockRow("NVDA", "182.58", "179.0"), stockRow("MSFT", "512.38", "515.9"), stockRow("TSLA", "348.57", "356.0"), stockRow("GOOGL", "198.10", "196.0"), stockRow("SPY", "669.08", "666.0")] })),
  );
  const rows = Array.from({ length: 12 }, (_, i) => ({ accountId: `a${i}`, handle: i === 3 ? "Player 4F2A" : `Player ${(0x1000 + i * 137).toString(16).toUpperCase()}`, cash: "50000", positionsValue: String(90000 - i * 4000), equity: String(140000 - i * 4000), rank: i + 1 }));
  await page.route("**/api/leaderboard", (r) => r.fulfill(json({ rows, total: 12, asOf: new Date().toISOString(), ageMs: 0, stale: false, lastFailure: null, viewer: { accountId: "a3" } })));
}
