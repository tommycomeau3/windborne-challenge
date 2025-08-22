import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Don’t block production builds on ESLint errors
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
