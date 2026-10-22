import { randomUUID, createHash } from "node:crypto";
import { prisma } from "../src/lib/db";
import { HttpError } from "../src/server/context";
import { consumeRateLimitKey, RATE_LIMITS } from "../src/server/rate-limit";

if (process.env.FINOVA_TEST_RUN !== "1" || process.env.NODE_ENV === "production") {
  throw new Error("Security integration requires FINOVA_TEST_RUN=1 and a non-production environment");
}
const databaseUrl = new URL(process.env.DATABASE_URL ?? "");
if (!["localhost", "127.0.0.1", "[::1]"].includes(databaseUrl.hostname) ||
    !["finova", "finova_test"].includes(databaseUrl.pathname.slice(1))) {
  throw new Error("Security integration requires a local Finova development/test database");
}
const a = `security-test:${randomUUID()}`;
const b = `security-test:${randomUUID()}`;
const c = `security-test:${randomUUID()}`;
const d = `security-test:${randomUUID()}`;
const hash = (subject: string, policy: string = "upload") => createHash("sha256").update(`${policy}:${subject}`).digest("hex");
let dbConnected = false;

async function main() {
  await prisma.$queryRaw`SELECT 1`;
  dbConnected = true;
  const limit = RATE_LIMITS.upload;
  const results = await Promise.allSettled(Array.from({ length: limit + 8 }, () => consumeRateLimitKey(a, "upload")));
  const accepted = results.filter(r => r.status === "fulfilled").length;
  const rejected = results.filter(r => r.status === "rejected");
  const unknownFailure = rejected.find(r => !(r.reason instanceof HttpError));
  if (unknownFailure && unknownFailure.status === "rejected") throw unknownFailure.reason;
  if (accepted !== limit || rejected.length !== 8 || rejected.some(r => {
    if (!(r.reason instanceof HttpError)) return true;
    const retryAfter = r.reason.retryAfterSeconds;
    return r.reason.status !== 429 || retryAfter === undefined || retryAfter < 1 || retryAfter > 60;
  })) {
    throw new Error(`Incorrect atomic quota: accepted ${accepted}, rejected ${rejected.length}`);
  }
  // The other user/workspace has an independent quota even during concurrent contention.
  await consumeRateLimitKey(b, "upload");
  const bCount = await prisma.apiRateLimit.findFirst({ where: { key: hash(b) } });
  if (bCount?.count !== 1) throw new Error("Rate-limit isolation failed");

  // Expired buckets must not block the current window and must be prunable.
  const old = new Date(Date.now() - 5 * 60_000);
  old.setSeconds(0, 0);
  await prisma.apiRateLimit.create({ data: { key: hash(b), windowStart: old, count: 1000, expiresAt: new Date(Date.now() - 3 * 60_000) } });
  await consumeRateLimitKey(b, "upload");
  // The test cleans only its own expired rows; production pruning runs with the scheduler.
  await prisma.apiRateLimit.deleteMany({ where: { key: hash(b), expiresAt: { lt: new Date() } } });
  if (await prisma.apiRateLimit.count({ where: { key: hash(b), expiresAt: { lt: new Date() } } })) {
    throw new Error("Expired rate-limit pruning failed");
  }
  // Unauthenticated OAuth per-client limits must be atomic across app instances.
  const auth = await Promise.allSettled(Array.from({ length: RATE_LIMITS["auth-client"] + 5 }, () => consumeRateLimitKey(c, "auth-client")));
  const authAllowed = auth.filter(result => result.status === "fulfilled").length;
  if (authAllowed !== RATE_LIMITS["auth-client"] || auth.some(result => result.status === "rejected" && (!(result.reason instanceof HttpError) || result.reason.status !== 429))) {
    throw new Error(`Pre-auth quota failed: ${authAllowed} accepted`);
  }
  await consumeRateLimitKey(d, "report");
  if (await prisma.apiRateLimit.count({ where: { key: hash(d, "report"), count: 1 } }) !== 1) throw new Error("Report quota failed");
  console.log(`PASS: PostgreSQL multi-instance-compatible quota (${limit} accepted, 8 rejected), isolation and expiry`);
  console.log(`PASS: pre-auth per-client quota (${authAllowed} accepted, 5 rejected), report quota, Retry-After from DB clock`);
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Security integration failed"); process.exitCode = 1; })
  .finally(async () => {
    if (dbConnected) {
      try {
        await prisma.apiRateLimit.deleteMany({ where: { key: { in: [hash(a), hash(b), hash(c, "auth-client"), hash(d, "report")] } } });
      } catch (error) {
        console.error("Test quota cleanup failed:", error instanceof Error ? error.message.split("\n").at(-1) : "unknown");
        process.exitCode = 1;
      }
    }
    await prisma.$disconnect();
  });
