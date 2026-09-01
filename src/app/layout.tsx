import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FPL Formula Lab",
  description: "Explainable FPL player rankings from FPL data.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(() => {
              const savedTheme = localStorage.getItem("fpl-theme");
              const theme = savedTheme === "light" || savedTheme === "dark"
                ? savedTheme
                : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
              document.documentElement.classList.toggle("dark", theme === "dark");
            })();`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
