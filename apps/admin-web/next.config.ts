import { resolve } from "node:path";
import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import { initCloudflareDev } from "../../scripts/init-cloudflare-dev";

const nextConfig: NextConfig = {
  // Keep the auth library's Node-side adapters outside Turbopack's dev graph.
  ...(process.env.NODE_ENV === "development"
    ? { serverExternalPackages: ["better-auth"] }
    : {}),
  outputFileTracingRoot: resolve(__dirname, "../.."),
  turbopack: {
    root: resolve(__dirname, "../.."),
  },
};

export default async function config(phase: string): Promise<NextConfig> {
  if (phase === PHASE_DEVELOPMENT_SERVER) {
    // Wait for the shared local bindings before an early request can open app-local state.
    await initCloudflareDev({
      configPath: resolve(__dirname, "wrangler.jsonc"),
      persist: {
        path:
          process.env.CF_LOCAL_PERSIST_PATH ??
          resolve(__dirname, "../../.wrangler/state/v3"),
      },
    });
  }
  return nextConfig;
}
