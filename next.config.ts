import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Phase 0 has no remote images. Declare the policy explicitly so a future
  // asset pipeline (docs/architecture.md §Assets) has one place to change.
  images: {
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;
