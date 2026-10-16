import type { ReactNode } from "react";
import { Terminal } from "./components/Terminal.js";

export default function TradingPage(): ReactNode {
  return (
    <div className="bp-app">
      <Terminal />
    </div>
  );
}
