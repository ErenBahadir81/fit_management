import type { NextConfig } from "next";

const API_URL = process.env.API_URL ?? "http://127.0.0.1:4000";

const nextConfig: NextConfig = {
  transpilePackages: ["@fitfloow/core", "@fitfloow/api-client"],
  // Always inline a literal so `process.env.NEXT_PUBLIC_API_FAKE === "1"` folds to a
  // constant at build time; with the flag unset the in-memory fake is dead code and its
  // chunk is dropped instead of merely lazy-loaded (see src/lib/api.ts).
  env: { NEXT_PUBLIC_API_FAKE: process.env.NEXT_PUBLIC_API_FAKE === "1" ? "1" : "0" },
  async rewrites() {
    // Same-origin API access in dev/prod so httpOnly cookies work without CORS gymnastics.
    return [{ source: "/api/v1/:path*", destination: `${API_URL}/api/v1/:path*` }];
  },
};

export default nextConfig;
