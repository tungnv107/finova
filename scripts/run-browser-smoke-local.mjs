/** Run the production server and browser QA in the same process environment. */
import { spawn } from "node:child_process";
import { once } from "node:events";

const port = process.env.FINOVA_QA_PORT || "3002";
const base = `http://localhost:${port}`;
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", port], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
let output = "";
server.stdout.on("data", chunk => { output += chunk.toString(); });
server.stderr.on("data", chunk => { output += chunk.toString(); });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let lastProbe = "not attempted";

function connectionDetails(error) {
  if (!(error instanceof Error)) return { description: String(error), denied: false };
  const causes = Array.isArray(error.cause?.errors) ? error.cause.errors : [error.cause];
  const failures = causes.filter(Boolean).map(item => ({
    code: item.code, address: item.address, port: item.port, message: item.message,
  }));
  return {
    description: `${error.message}; cause=${JSON.stringify(failures)}`,
    denied: failures.some(item => item.code === "EACCES" || item.code === "EPERM"),
  };
}

try {
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    if (server.exitCode !== null) break;
    try {
      const result = await fetch(`${base}/login`, { signal: AbortSignal.timeout(2500) });
      if (result.ok) { ready = true; break; }
      lastProbe = `HTTP ${result.status}: ${(await result.text()).slice(0, 180)}`;
    } catch (error) {
      const failure = connectionDetails(error);
      lastProbe = failure.description;
      if (failure.denied) {
        throw new Error(`Local loopback connection to ${base} is denied (EACCES/EPERM). Run QA where localhost networking is permitted, then retry. Last probe: ${lastProbe}`);
      }
    }
    await pause(500);
  }
  if (!ready) throw new Error(`Finova production server inaccessible on ${base}. Last probe: ${lastProbe}. Startup output: ${output.slice(-2000)}`);
  const test = spawn(process.execPath, ["scripts/browser-smoke.mjs"], {
    stdio: "inherit", windowsHide: true,
    env: { ...process.env, FINOVA_BROWSER_URL: base },
  });
  const [code, signal] = await once(test, "exit");
  if (code !== 0) throw new Error(`Browser smoke failed: ${signal || code}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  server.kill();
}
