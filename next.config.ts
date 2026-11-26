import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // The dev-only Next.js badge sits bottom-left by default, over the sidebar's account menu. On a
  // phone every corner holds a control (bottom-right is the More tab), so e2e runs turn it off.
  devIndicators: process.env.PLAYWRIGHT ? false : { position: "bottom-right" },
};

export default nextConfig;
