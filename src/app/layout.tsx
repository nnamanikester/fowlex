import type { Metadata, Viewport } from "next";
import { Fraunces, Geist_Mono, IBM_Plex_Sans, Lexend } from "next/font/google";

import { Providers } from "@/providers";
import "./globals.css";

/**
 * Three faces, each with one job. Fraunces for titles: a soft, rounded serif with the warmth of
 * the land. Lexend for reading: drawn from reading-proficiency research to cut visual stress and
 * help people new to screens read with ease (and its zero is plain, unlike a slashed one). IBM Plex Sans for numbers: tabular figures that
 * line naira up in columns, with a clear 1 and 7. Geist Mono stays for codes (INV-, B-2026-).
 */
const display = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
  axes: ["SOFT", "opsz"],
});
const body = Lexend({ subsets: ["latin"], display: "swap", variable: "--font-body" });
const figures = IBM_Plex_Sans({ subsets: ["latin"], display: "swap", variable: "--font-figures" });
const geistMono = Geist_Mono({ subsets: ["latin"], display: "swap", variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: { default: "Fowlex", template: "%s · Fowlex" },
  description: "Fowlex Farms management dashboard",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f4ed" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1317" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${figures.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
