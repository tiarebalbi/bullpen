/** "Part 1" for the moment id "part-01" a carried explorer item names as the one that built it. */
export function builtInLabel(builtIn: string): string {
  const match = /^part-(\d+)$/.exec(builtIn);
  return match ? `Part ${Number(match[1])}` : builtIn;
}
