/** Isolated local QA only; never points at the user's finova database. */
import { spawnSync } from "node:child_process";
const source = new URL(process.env.DATABASE_URL ?? "postgres://invalid/invalid");
if (source.hostname !== "127.0.0.1" || source.port !== "55433" || source.pathname !== "/finova") throw new Error("Requires the local Finova source connection");
source.pathname = "/finova_ai_test_p0_20261029_a";
process.env.DATABASE_URL = source.toString();
process.env.FINOVA_ADMIN_ENABLED = "0";
process.env.FINOVA_PREMIUM_ENTITLEMENTS_ENFORCED = "0";
process.env.FINOVA_USER_ACCESS_ENFORCED = "0";
process.env.BETTER_AUTH_URL = "http://localhost:31649";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:31649";
if (process.argv.includes("--migrate")) {
  const result = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { stdio: "inherit", env: process.env, windowsHide: true });
  process.exitCode = result.status ?? 1;
} else if (process.argv.includes("--server")) {
  process.env.FINOVA_NEXT_DIST_DIR = ".next-ai-p0-qa";
  const result = spawnSync(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "-p", "31649"], { stdio: "inherit", env: process.env, windowsHide: true });
  process.exitCode = result.status ?? 1;
} else {
  await import("./ai-p0-integration-check.ts");
}
