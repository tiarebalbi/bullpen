import type { ReactNode } from "react";
import "@bullpen/ui/styles.css";
import { Footer } from "./components/Footer.js";

export const metadata = {
  title: "Bullpen — Trading",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Footer />
      </body>
    </html>
  );
}
