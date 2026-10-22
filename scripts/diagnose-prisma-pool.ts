/** Read-only G7 Prisma pool cold-start diagnostic. Run only against finova_bench. */
import assert from "node:assert/strict";
import { lookup } from "node:dns/promises";
import { createConnection } from "node:net";
import { performance, monitorEventLoopDelay } from "node:perf_hooks";
import { PrismaClient } from "@finova/prisma";

const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/");
const hostAllowed = (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.port === "55433") ||
  (url.hostname === "db" && url.port === "5432");
if (process.env.FINOVA_BENCH_PROFILE !== "1" || process.env.NODE_ENV === "production" ||
    !hostAllowed || url.pathname !== "/finova_bench") {
  throw new Error("Profile requires FINOVA_BENCH_PROFILE=1 and isolated finova_bench on localhost:55433 or db:5432.");
}

type Sample = { durationMs: number; pid: number };
function distribution(samples: number[]) {
  assert(samples.length > 0);
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (fraction: number) => Number(sorted[Math.ceil(fraction * sorted.length) - 1].toFixed(2));
  return { count: sorted.length, p50Ms: at(0.5), p95Ms: at(0.95), p99Ms: at(0.99), maxMs: at(1) };
}

async function networkProbes() {
  // Timing is diagnostic only. TCP connects are immediately closed; no DB auth/data is sent.
  const dnsMs: number[] = [];
  const tcpMs: number[] = [];
  const families = new Set<number>();
  for (let i = 0; i < 5; i++) {
    let start = performance.now();
    const resolved = await lookup(url.hostname);
    dnsMs.push(performance.now() - start);
    families.add(resolved.family);

    start = performance.now();
    await new Promise<void>((resolve, reject) => {
      const socket = createConnection({ host: url.hostname, port: Number(url.port) });
      socket.setTimeout(5000);
      socket.once("connect", () => { socket.destroy(); resolve(); });
      socket.once("error", reject);
      socket.once("timeout", () => { socket.destroy(); reject(new Error("TCP probe timeout")); });
    });
    tcpMs.push(performance.now() - start);
  }
  return { dns: distribution(dnsMs), tcpConnect: distribution(tcpMs), dnsFamilies: [...families] };
}

async function main() {
  const durations: number[] = [];
  const network = await networkProbes();
  const constructorStarted = performance.now();
  const db = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
  const prismaConstructorMs = Number((performance.now() - constructorStarted).toFixed(2));
  db.$on("query", event => durations.push(event.duration));
  const loop = monitorEventLoopDelay({ resolution: 10 });
  loop.enable();

  async function wave(concurrency: number) {
    const totalStarted = performance.now();
    const queries: Sample[] = await Promise.all(Array.from({ length: concurrency }, async () => {
      const started = performance.now();
      const [row] = await db.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
      return { durationMs: performance.now() - started, pid: row.pid };
    }));
    return {
      elapsedMs: Number((performance.now() - totalStarted).toFixed(2)),
      uniqueConnections: new Set(queries.map(q => q.pid)).size,
      request: distribution(queries.map(q => q.durationMs)),
    };
  }

  try {
    const started = performance.now();
    await db.$connect();
    const connectMs = Number((performance.now() - started).toFixed(2));
    const cold = await wave(16);
    const warm = await wave(16);
    const sequential = await wave(1);
    const result = {
      date: new Date().toISOString(),
      environment: { platform: process.platform, node: process.version,
        host: url.hostname, connectionLimit: url.searchParams.get("connection_limit") ?? "default" },
      network, prismaConstructorMs, connectMs, cold, warm, sequential,
      prismaQueryDuration: distribution(durations),
      prismaQueriesOver500Ms: durations.filter(ms => ms > 500).length,
      eventLoopMaxMs: Number((loop.max / 1e6).toFixed(2)),
    };
    console.log(JSON.stringify(result, null, 2));
  } finally {
    loop.disable();
    await db.$disconnect();
  }
}

// Do not log Prisma errors or a connection URL: they may contain credentials.
main().catch(error => {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "UNCLASSIFIED";
  console.error(`Prisma pool diagnostic failed (${code}).`);
  process.exitCode = 1;
});
