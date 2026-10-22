import { PrismaClient } from "@finova/prisma";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
// Opt-in benchmark diagnostics; production and normal development keep default Prisma logging.
const profileBenchQueries = process.env.FINOVA_BENCH_PROFILE === "1" && process.env.NODE_ENV !== "production";
export const benchQueryTimes: Array<{ completedAtMs: number; durationMs: number; operation: string }> = [];
function makePrisma() {
  if (!profileBenchQueries) return new PrismaClient();
  const client = new PrismaClient({ log: [{ level: "query", emit: "event" }] });
  client.$on("query", event => {
    // No SQL parameters or application data in the diagnostic artifact.
    benchQueryTimes.push({ completedAtMs: event.timestamp.getTime(), durationMs: event.duration,
      operation: event.query.trim().split(/\s+/, 1)[0]?.toUpperCase() ?? "UNKNOWN" });
  });
  return client;
}
export const prisma = globalForPrisma.prisma ?? makePrisma();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
