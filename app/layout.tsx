import type { Metadata } from "next";
import { Fraunces, Newsreader } from "next/font/google";
import { PUBLIC_URL } from "../lib/base.ts";
import "./globals.css";

const display = Fraunces({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const text = Newsreader({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-text", display: "swap" });

export const metadata: Metadata = {
  title: "Circa",
  description: "A globe of documented human history, from 3500 BCE to today.",
  alternates: { canonical: PUBLIC_URL },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${text.variable}`}>
      <body>{children}</body>
    </html>
  );
}
