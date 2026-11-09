import { resolve } from "node:path";
import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Make local Cloudflare bindings available to next dev.
initOpenNextCloudflareForDev({ persist: { path: process.env.CF_LOCAL_PERSIST_PATH ?? resolve(__dirname, "../../.wrangler/state/v3") } });

const nextConfig: NextConfig = {
  // Keep the auth library's Node-side adapters outside Turbopack's dev graph.
  ...(process.env.NODE_ENV === "development" ? { serverExternalPackages: ["better-auth"] } : {}),
  outputFileTracingRoot: resolve(__dirname, "../.."),
  turbopack: {
    root: resolve(__dirname, "../.."),
  },
};

export default nextConfig;
