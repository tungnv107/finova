import { prisma } from "../src/lib/db";
import { pruneExpiredRateLimits } from "../src/server/rate-limit";

// Run with an isolated scheduler/worker environment; deletes only expired quota rows.
async function main() {
  try {
    const result = await pruneExpiredRateLimits();
    console.log(`Expired API quota buckets deleted: ${result.count}`);
  } catch (error) {
    console.error("Quota cleanup failed:", error instanceof Error ? error.message.split("\n").at(-1) : "unknown");
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
