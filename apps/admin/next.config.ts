import type { NextConfig } from "next";

const API_URL = process.env.API_URL ?? "http://127.0.0.1:4000";

const nextConfig: NextConfig = {
  transpilePackages: ["@fitfloow/core", "@fitfloow/api-client"],
  async rewrites() {
    // Same-origin API access in dev/prod so httpOnly cookies work without CORS gymnastics.
    return [{ source: "/api/v1/:path*", destination: `${API_URL}/api/v1/:path*` }];
  },
};

export default nextConfig;
