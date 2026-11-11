import { setTimeout } from "node:timers/promises";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

export async function initCloudflareDev(
  options: Parameters<typeof initOpenNextCloudflareForDev>[0],
) {
  for (let attempt = 0; ; attempt++) {
    try {
      await initOpenNextCloudflareForDev(options);
      return;
    } catch (error) {
      // Both dev servers open the same D1 file. Let the other process finish recovery.
      const busy =
        error instanceof Error &&
        /\bSQLITE_BUSY(?:_[A-Z]+)?\b/.test(error.message);
      if (!busy || attempt === 4) throw error;
      await setTimeout(200 * 2 ** attempt);
    }
  }
}
