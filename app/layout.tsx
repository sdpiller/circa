import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chronoglobe",
  description: "A globe of documented human history, from 3500 BCE to today.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
