import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [tool, ...args] = process.argv.slice(2);
const binaries = {
  next: "next/dist/bin/next",
  opennext: "@opennextjs/cloudflare/dist/cli/index.js",
  wrangler: "wrangler/bin/wrangler.js",
};
if (!Object.hasOwn(binaries, tool)) {
  throw new Error(`Unsupported tool: ${tool}`);
}
const env = { ...process.env };
// Limit parallel filesystem work on Windows, where recursive output copies failed.
if (process.platform === "win32") env.UV_THREADPOOL_SIZE ??= "1";
// Some managed Windows TEMP paths contain '#', which OpenNext's generated
// module URL treats as a fragment. Keep its temporary modules under the app.
if (process.platform === "win32" && tool === "opennext") {
  const tempPath=resolve(".wrangler/tmp");
  mkdirSync(tempPath,{recursive:true});
  env.TEMP=tempPath;env.TMP=tempPath;
}
// Keep local tool state in the app, including in restricted development sessions.
env.WRANGLER_LOG_PATH ??= resolve(".wrangler/logs");
env.WRANGLER_REGISTRY_PATH ??= resolve(".wrangler/registry");
const entrypoint = fileURLToPath(new URL(`../node_modules/${binaries[tool]}`, import.meta.url));
const result = spawnSync(process.execPath, [entrypoint, ...args], {
  cwd: process.cwd(), env, stdio: "inherit",
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
