import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter, Jost } from "next/font/google";

import { Providers } from "@/providers";
import "./globals.css";

/** Inter for the interface (its tabular figures line up naira columns), Jost for headings (the
 * free cousin of the wordmark's Futura), Geist Mono for codes: invoice numbers, batch codes, references. */
const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });
const jost = Jost({ subsets: ["latin"], display: "swap", variable: "--font-jost" });
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
    <html lang="en" className={`${inter.variable} ${jost.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
