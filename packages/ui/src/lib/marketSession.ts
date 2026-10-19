/**
 * Whether the U.S. equity market is closed at `epochMs`: a weekend, or a weekday outside 09:30-16:00 in New York.
 *
 * It answers "closed" only when the clock makes it certain. An exchange holiday is closed too, but this knows no
 * holidays, so on one it answers false: a caller shows "market closed" only on a true, never "open" on a false.
 */
export function isUsMarketClosed(epochMs: number): boolean {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(epochMs));
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";
  if (get("weekday") === "Sat" || get("weekday") === "Sun") return true;
  const minutes = Number(get("hour")) * 60 + Number(get("minute"));
  return minutes < 9 * 60 + 30 || minutes >= 16 * 60;
}
