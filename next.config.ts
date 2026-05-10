import type { NextConfig } from "next";

/**
 * Comanda is "installable" via the web manifest + meta tags only.
 * We deliberately don't ship a service worker because the user confirmed
 * offline support isn't needed. If/when offline becomes a requirement,
 * add @serwist/next or a Workbox-based SW here.
 */
const nextConfig: NextConfig = {
  experimental: {
    // Server actions handle the entire staff flow; bumping the body limit
    // so photos can ride along.
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
  images: {
    remotePatterns: [
      // Supabase Storage signed URLs
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
};

export default nextConfig;
