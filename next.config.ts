import type { NextConfig } from "next";

/**
 * Fully static export. The browser talks to the Attention Atlas API directly,
 * so there is nothing for a server to do at request time — no route handlers,
 * no serverless functions, no function timeout to exceed while the Hugging
 * Face Space wakes from sleep.
 */
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
