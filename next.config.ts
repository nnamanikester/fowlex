import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  cacheLife: {
    // Per-person data in the browser: reused for 30 s while moving between pages (the least that
    // keeps prefetching), refreshed in the background after a minute, never older than 5.
    session: { stale: 30, revalidate: 60, expire: 300 },
  },
  // The dev-only Next.js badge sits bottom-left by default, over the sidebar's account menu. On a
  // phone every corner holds a control (bottom-right is the More tab), so e2e runs turn it off.
  devIndicators: process.env.PLAYWRIGHT ? false : { position: "bottom-right" },
};

export default nextConfig;
