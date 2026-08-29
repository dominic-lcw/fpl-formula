import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FPL Formula Lab",
  description: "Explainable FPL player rankings from FPL data.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
