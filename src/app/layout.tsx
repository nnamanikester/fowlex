import type { Metadata, Viewport } from "next";
import { Geist_Mono, Urbanist } from "next/font/google";

import { Providers } from "@/providers";
import "./globals.css";

/** The Pickriders pair: Urbanist for the interface (tabular figures for money), Geist Mono for codes. */
const urbanist = Urbanist({ subsets: ["latin"], display: "swap", variable: "--font-urbanist" });
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
    <html lang="en" className={`${urbanist.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
