import { resolve } from "node:path";
import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Make local Cloudflare bindings available to next dev.
initOpenNextCloudflareForDev({ persist: { path: resolve(__dirname, "../../.wrangler/state/v3") } });

const nextConfig: NextConfig = {
  outputFileTracingRoot: resolve(__dirname, "../.."),
  turbopack: {
    root: resolve(__dirname, "../.."),
  },
};

export default nextConfig;
