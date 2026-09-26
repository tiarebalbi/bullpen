import type { ReactNode } from "react";

export function Footer(): ReactNode {
  return (
    <footer className="bp-footer">
      <p>
        Bullpen is Part 1 of <em>Architecting Software in 2026</em>, a blog series built in public by Tiarê
        Balbi. Nothing beyond this page is published yet — the trading app, the rest of the series, and the
        live league all open in later parts.
      </p>
    </footer>
  );
}
