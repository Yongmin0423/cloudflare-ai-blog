import { resolve } from "node:path";
import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Make local Cloudflare bindings available to next dev.
initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  outputFileTracingRoot: resolve(__dirname, "../.."),
  turbopack: {
    root: resolve(__dirname, "../.."),
  },
};

export default nextConfig;
