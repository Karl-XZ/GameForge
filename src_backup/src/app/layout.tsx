import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Gemini GameForge",
  description: "One‑click generators for Text Adventure / TRPG and Side‑Scroller Action games, powered by Gemini.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <body>
        {children}
      </body>
    </html>
  );
}
