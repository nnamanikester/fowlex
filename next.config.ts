import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // The dev-only Next.js badge sits bottom-left by default, over the sidebar's account menu.
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
