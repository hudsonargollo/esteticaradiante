import type { NextConfig } from "next";

/**
 * NEXT_BUILD_MODE=desktop → static export, served by the Electron app's
 * embedded Express server (avoids file:// CORS/routing issues). Same
 * convention as FloCafe's frontend.
 */
const isDesktop = process.env.NEXT_BUILD_MODE === "desktop";

const nextConfig: NextConfig = {
  output: isDesktop ? "export" : undefined,
  trailingSlash: isDesktop,
  images: {
    unoptimized: isDesktop,
  },
  turbopack: {
    root: '.',
  },
};

export default nextConfig;
