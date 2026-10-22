/** G7 read-path benchmark. Destructive fixtures are restricted to finova_bench on localhost. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { prisma, benchQueryTimes } from "../src/lib/db";
import { createWallet, listTransactionsPage, walletBalances } from "../src/server/ledger";
import { seedCategories } from "../src/server/seed-categories";
import { overview } from "../src/server/reporting";
import { netWorth } from "../src/server/net-worth";
import { expenseHeatmap, historicalTrends } from "../src/server/analytics";
import { listGoals } from "../src/server/goals";
import { transactionsCsv } from "../src/server/csv-export";
import { auditLedger } from "./reconcile-ledger";
import { createBudget, listBudgetPerformance } from "../src/server/budgets";

const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/");
if (process.env.FINOVA_BENCH_RUN !== "1" || process.env.NODE_ENV === "production" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.pathname !== "/finova_bench" || url.port !== "55433") {
  throw new Error("Benchmark chỉ chạy khi FINOVA_BENCH_RUN=1 và DATABASE_URL trỏ đến 127.0.0.1:55433/finova_bench (hoặc localhost:55433).");
}

function percentiles(times: number[]) {
  const sorted = [...times].sort((a, b) => a - b);
  const at = (p: number) => Number(sorted[Math.ceil(p * sorted.length) - 1].toFixed(2));
  return { samples: sorted.length, p50Ms: at(0.5), p95Ms: at(0.95), p99Ms: at(0.99) };
}

async function measure(action: () => Promise<unknown>, samples = 20) {
  for (let i = 0; i < 2; i++) await action();
  const times: number[] = [];
  for (let i = 0; i < samples; i++) {
    const started = performance.now();
    await action();
    times.push(performance.now() - started);
  }
  return percentiles(times);
}

async function measureConcurrent(action: (measured: boolean) => Promise<unknown>, concurrency: number, rounds = 8) {
  await Promise.all(Array.from({ length: concurrency }, () => action(false)));
  const times: number[] = [];
  const eventLoop = monitorEventLoopDelay({ resolution: 10 });
  const utilizationStart = performance.eventLoopUtilization();
  eventLoop.enable();
  const started = performance.now();
  try {
    for (let i = 0; i < rounds; i++) {
      await Promise.all(Array.from({ length: concurrency }, async () => {
        const requestStarted = performance.now();
        await action(true);
        times.push(performance.now() - requestStarted);
      }));
    }
  } finally {
    eventLoop.disable();
  }
  const durationSeconds = (performance.now() - started) / 1000;
  const loopUsage = performance.eventLoopUtilization(utilizationStart);
  return { concurrency, rounds, ...percentiles(times),
    throughputRps: Number((times.length / durationSeconds).toFixed(2)),
    maxMs: Number(Math.max(...times).toFixed(2)),
    requestsOver500Ms: times.filter(ms => ms > 500).length,
    eventLoopP99Ms: Number((eventLoop.percentile(99) / 1e6).toFixed(2)),
    eventLoopMaxMs: Number((eventLoop.max / 1e6).toFixed(2)),
    eventLoopUtilization: Number(loopUsage.utilization.toFixed(3)) };
}

async function main() {
  const prefix = `bench-${randomUUID()}`;
  const userId = `${prefix}:user`;
  const workspaceId = `${prefix}:workspace`;
  let output: { date: string; dataset: string; samples: string; fixtureCounts: { transactions: number; journals: number; postings: number };
    readings: Record<string, ReturnType<typeof percentiles>>;
    poolPrewarm: ReturnType<typeof percentiles>;
    concurrentDashboard: Record<string, Awaited<ReturnType<typeof measureConcurrent>>>;
    concurrentDashboardSegments: Record<string, Record<string, ReturnType<typeof percentiles>>>;
    concurrentDashboardSlowSamples: Record<string, Array<{ totalMs: number; segmentsMs: Record<string, number>; queryEvents?: { count: number; maxDurationMs: number; eventsOver500Ms: number } }>>;
    concurrentDiagnostics: Record<string, Record<string, Awaited<ReturnType<typeof measureConcurrent>>>>;
    prismaQueryDiagnostics?: { queryCount: number; queryDuration: ReturnType<typeof percentiles>; eventsOver500Ms: number };
    explainAnalyze: Record<string, unknown> } | undefined;
  const errors: unknown[] = [];
  await prisma.$connect();
  try {
    await prisma.user.create({ data: { id: userId, name: "G7 performance fixture", email: `${prefix}@example.invalid` } });
    await prisma.workspace.create({ data: { id: workspaceId, name: "G7 benchmark", createdById: userId,
      memberships: { create: { userId } } } });
    await seedCategories(workspaceId);
    const ctx = { workspaceId, userId, name: "Benchmark", image: null };
    const wallet = await createWallet(ctx, { name: "Benchmark wallet", type: "CASH",
      openingBalance: "0", openingDate: "2026-10-01T00:00:00+07:00" });
    const category = await prisma.category.findFirstOrThrow({ where: { workspaceId, kind: "EXPENSE" } });

    // Only SQL-created synthetic records inside the isolated benchmark DB.
    // The journal and its debit/credit postings commit atomically under deferred invariants.
    await prisma.$transaction(async db => {
      await db.$executeRaw`
        INSERT INTO "Transaction" ("id", "workspaceId", "kind", "status", "amount", "currency",
          "walletId", "categoryId", "occurredAt", "createdById", "version", "createdAt", "updatedAt")
        SELECT ${prefix} || ':t:' || n, ${workspaceId}, 'EXPENSE', 'ACTIVE', 1000, 'VND',
          ${wallet.id}, ${category.id}, TIMESTAMP '2026-10-12 03:00:00' + n * INTERVAL '1 second',
          ${userId}, 1, NOW(), NOW()
        FROM generate_series(1, 10000) AS n`;
      await db.$executeRaw`
        INSERT INTO "Journal" ("id", "workspaceId", "transactionId", "walletId", "kind", "effectiveAt")
        SELECT ${prefix} || ':j:' || n, ${workspaceId}, ${prefix} || ':t:' || n,
          ${wallet.id}, 'POSTED', TIMESTAMP '2026-10-12 03:00:00' + n * INTERVAL '1 second'
        FROM generate_series(1, 10000) AS n`;
      await db.$executeRaw`
        INSERT INTO "Posting" ("id", "journalId", "ledgerAccountId", "side", "amount", "currency")
        SELECT ${prefix} || ':debit:' || n, ${prefix} || ':j:' || n,
          ${category.ledgerAccountId}, 'DEBIT', 1000, 'VND'
        FROM generate_series(1, 10000) AS n`;
      await db.$executeRaw`
        INSERT INTO "Posting" ("id", "journalId", "ledgerAccountId", "side", "amount", "currency")
        SELECT ${prefix} || ':credit:' || n, ${prefix} || ':j:' || n,
          ${wallet.ledgerAccountId}, 'CREDIT', 1000, 'VND'
        FROM generate_series(1, 10000) AS n`;
    }, { timeout: 120_000, maxWait: 15_000 });

    const fixtureCounts = {
      transactions: await prisma.transaction.count({ where: { workspaceId } }),
      journals: await prisma.journal.count({ where: { workspaceId } }),
      postings: await prisma.posting.count({ where: { journal: { workspaceId } } }),
    };
    assert.deepEqual(fixtureCounts, { transactions: 10_000, journals: 10_000, postings: 20_000 },
      "Benchmark requires exactly 10,000 transactions, 10,000 journals and 20,000 postings");
    const range = { start: "2026-10-01", endExclusive: "2026-11-01" };
    assert.equal((await overview(workspaceId, range)).kpis.expense, "10000000");
    const budget = await createBudget(ctx, { name: "Benchmark category budget", scope: "CATEGORY", period: "MONTHLY",
      start: range.start, endExclusive: range.endExclusive, limitAmount: "15000000", categoryIds: [category.id] });
    const budgetReport = (await listBudgetPerformance(workspaceId)).find(x => x.id === budget.id);
    assert.equal(budgetReport?.used, "10000000", "Budget must aggregate all 10,000 expense postings exactly");
    assert.deepEqual(budgetReport?.thresholds, ["P50"]);
    const audit = await auditLedger(prisma, workspaceId);
    assert.equal(Object.values(audit.findings).flat().length, 0, "Benchmark fixture must be balanced");

    const readings = {
      dashboard: await measure(() => overview(workspaceId, range)),
      walletBalances: await measure(() => walletBalances(workspaceId)),
      transactionPage: await measure(() => listTransactionsPage(workspaceId, { limit: 50 })),
      goals: await measure(() => listGoals(workspaceId)),
      netWorth: await measure(() => netWorth(workspaceId, "2026-10-20")),
      expenseHeatmap: await measure(() => expenseHeatmap(workspaceId, range)),
      trends: await measure(() => historicalTrends(workspaceId, range, 12)),
      budgetPerformance: await measure(() => listBudgetPerformance(workspaceId)),
      csvExport: await measure(() => transactionsCsv(workspaceId, range), 5),
    };
    // Force at least 16 simultaneous DB queries before the steady-state load.
    // Compare with earlier runs to distinguish cold pool expansion from SQL latency.
    const prewarmTimes = await Promise.all(Array.from({ length: 16 }, async () => {
      const started = performance.now();
      const rows = await prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok FROM pg_sleep(0.05)`;
      assert.equal(rows[0]?.ok, 1);
      return performance.now() - started;
    }));
    const poolPrewarm = percentiles(prewarmTimes);
    // One Node.js process, concurrent requests sharing the real Prisma pool.
    // This reveals local contention; it is not multi-instance or HTTP SLA evidence.
    const concurrentDashboard: Record<string, Awaited<ReturnType<typeof measureConcurrent>>> = {};
    const concurrentDashboardSegments: Record<string, Record<string, ReturnType<typeof percentiles>>> = {};
    const concurrentDashboardSlowSamples: Record<string, Array<{ totalMs: number; segmentsMs: Record<string, number>; queryEvents?: { count: number; maxDurationMs: number; eventsOver500Ms: number } }>> = {};
    const concurrentDiagnostics: Record<string, Record<string, Awaited<ReturnType<typeof measureConcurrent>>>> = {};
    benchQueryTimes.length = 0;
    for (const concurrency of [4, 8, 16]) {
      const segmentDurations: Record<string, number[]> = {
        aggregate: [], walletBalances: [], transactionPage: [], topExpenses: [],
      };
      const slowSamples: Array<{ totalMs: number; segmentsMs: Record<string, number>; queryEvents?: { count: number; maxDurationMs: number; eventsOver500Ms: number } }> = [];
      concurrentDashboard[String(concurrency)] = await measureConcurrent(async (measured) => {
        const segmentsMs: Record<string, number> = {};
        const start = performance.now();
        const result = await overview(workspaceId, range, (name, elapsedMs) => { segmentsMs[name] = elapsedMs; });
        assert.equal(result.kpis.expense, "10000000", "Concurrent aggregate returned an incorrect KPI");
        if (measured) {
          // The overview adds optional report reads (previous period, net worth,
          // budgets, etc.). Capture every timed segment rather than assuming
          // only the original four queries exist.
          for (const [name, elapsedMs] of Object.entries(segmentsMs)) {
            (segmentDurations[name] ??= []).push(elapsedMs);
          }
          const totalMs = performance.now() - start;
          if (totalMs > 500) {
            const queryEvents = benchQueryTimes.filter(event => event.completedAtMs >= performance.timeOrigin + start &&
              event.completedAtMs <= performance.timeOrigin + performance.now());
            slowSamples.push({
            totalMs: Number(totalMs.toFixed(2)),
            segmentsMs: Object.fromEntries(Object.entries(segmentsMs).map(([name, ms]) => [name, Number(ms.toFixed(2))])),
            ...(process.env.FINOVA_BENCH_PROFILE === "1" ? { queryEvents: {
              count: queryEvents.length,
              maxDurationMs: queryEvents.length ? Math.max(...queryEvents.map(event => event.durationMs)) : 0,
              eventsOver500Ms: queryEvents.filter(event => event.durationMs > 500).length,
            } } : {}),
          });
          }
        }
      }, concurrency);
      concurrentDashboardSegments[String(concurrency)] = Object.fromEntries(
        Object.entries(segmentDurations).map(([name, times]) => [name, percentiles(times)]));
      concurrentDashboardSlowSamples[String(concurrency)] = slowSamples;
      // Same Prisma pool and fixture, measured separately. The sleep query distinguishes
      // connection/pool scheduling from database work and Node.js event-loop stalls.
      concurrentDiagnostics[String(concurrency)] = {
        dbPing: await measureConcurrent(async () => {
          const rows = await prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`;
          assert.equal(rows[0]?.ok, 1);
        }, concurrency),
        dbSleep50Ms: await measureConcurrent(async () => {
          const rows = await prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok FROM pg_sleep(0.05)`;
          assert.equal(rows[0]?.ok, 1);
        }, concurrency),
        walletBalances: await measureConcurrent(async () => {
          const wallets = await walletBalances(workspaceId, new Date("2026-10-31T17:00:00Z"));
          assert.equal(wallets.length, 1);
        }, concurrency),
        transactionPage: await measureConcurrent(async () => {
          const page = await listTransactionsPage(workspaceId, {
            from: new Date("2026-09-30T17:00:00Z"), to: new Date("2026-10-31T17:00:00Z"), limit: 8,
          });
          assert.equal(page.items.length, 8);
        }, concurrency),
        topExpenses: await measureConcurrent(async () => {
          const rows = await prisma.transaction.findMany({
            where: { workspaceId, status: "ACTIVE", kind: "EXPENSE",
              occurredAt: { gte: new Date("2026-09-30T17:00:00Z"), lt: new Date("2026-10-31T17:00:00Z") } },
            orderBy: [{ amount: "desc" }, { occurredAt: "desc" }], take: 5,
          });
          assert.equal(rows.length, 5);
        }, concurrency),
      };
    }
    // These read-only plans describe representative SQL for the two highest-volume
    // paths; the measured timings above remain those of the real application services.
    const [transactionPlan] = await prisma.$queryRaw<Array<{ "QUERY PLAN": unknown }>>`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      SELECT "id" FROM "Transaction"
      WHERE "workspaceId" = ${workspaceId} AND "status" = 'ACTIVE'
      ORDER BY "occurredAt" DESC, "id" DESC LIMIT 50`;
    const [postingPlan] = await prisma.$queryRaw<Array<{ "QUERY PLAN": unknown }>>`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      SELECT p."side", SUM(p."amount") FROM "Posting" p
      JOIN "Journal" j ON j."id" = p."journalId"
      WHERE j."workspaceId" = ${workspaceId}
        AND j."effectiveAt" >= ${new Date("2026-10-01T00:00:00Z")}
        AND j."effectiveAt" < ${new Date("2026-11-01T00:00:00Z")}
      GROUP BY p."side"`;
    const [dashboardPlan] = await prisma.$queryRaw<Array<{ "QUERY PLAN": unknown }>>`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      SELECT ((j."effectiveAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)::text AS day,
        a."kind", a."id" AS "accountId", a."name" AS "accountName",
        c."id" AS "categoryId", c."name" AS "categoryName", c."color" AS "categoryColor",
        SUM(CASE WHEN (a."kind" = 'EXPENSE'::"AccountKind" AND p."side" = 'DEBIT'::"EntrySide")
                      OR (a."kind" = 'INCOME'::"AccountKind" AND p."side" = 'CREDIT'::"EntrySide")
          THEN p."amount" ELSE -p."amount" END) AS amount
      FROM "Journal" j
      JOIN "Posting" p ON p."journalId" = j."id"
      JOIN "LedgerAccount" a ON a."id" = p."ledgerAccountId"
      LEFT JOIN "Category" c ON c."ledgerAccountId" = a."id" AND c."workspaceId" = ${workspaceId}
      WHERE j."workspaceId" = ${workspaceId} AND a."workspaceId" = ${workspaceId}
        AND a."kind" IN ('INCOME', 'EXPENSE')
        AND j."effectiveAt" >= ${new Date("2026-09-30T17:00:00Z")}
        AND j."effectiveAt" < ${new Date("2026-10-31T17:00:00Z")}
      GROUP BY day, a."kind", a."id", a."name", c."id", c."name", c."color"`;
    const [budgetPlan] = await prisma.$queryRaw<Array<{ "QUERY PLAN": unknown }>>`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      SELECT b."id", SUM(CASE WHEN p."side" = 'DEBIT'::"EntrySide" THEN p."amount" ELSE -p."amount" END)
      FROM "Budget" b
      JOIN "Journal" j ON j."workspaceId" = b."workspaceId"
        AND j."effectiveAt" >= b."startAt" AND j."effectiveAt" < b."endAt"
      JOIN "Posting" p ON p."journalId" = j."id"
      JOIN "LedgerAccount" a ON a."id" = p."ledgerAccountId"
        AND a."workspaceId" = b."workspaceId" AND a."kind" = 'EXPENSE'::"AccountKind"
      WHERE b."workspaceId" = ${workspaceId} AND b."id" = ${budget.id}
        AND (b."scope" = 'TOTAL'::"BudgetScope" OR EXISTS (
          SELECT 1 FROM "BudgetCategory" bc
          JOIN "Category" c ON c."id" = bc."categoryId" AND c."workspaceId" = bc."workspaceId"
          WHERE bc."budgetId" = b."id" AND bc."workspaceId" = b."workspaceId"
            AND c."ledgerAccountId" = a."id"
        ))
      GROUP BY b."id"`;
    const prismaQueryDiagnostics = process.env.FINOVA_BENCH_PROFILE === "1" && benchQueryTimes.length
      ? { queryCount: benchQueryTimes.length,
        queryDuration: percentiles(benchQueryTimes.map(event => event.durationMs)),
        eventsOver500Ms: benchQueryTimes.filter(event => event.durationMs > 500).length } : undefined;
    output = { date: new Date().toISOString(), dataset: "10,000 balanced VND expense transactions; isolated finova_bench database",
      samples: "20 sequential requests per read path (2 warmups), CSV 5; dashboard and pool/path diagnostics concurrency 4/8/16 with 8 rounds each", fixtureCounts, readings,
      poolPrewarm, concurrentDashboard, concurrentDashboardSegments, concurrentDashboardSlowSamples, concurrentDiagnostics,
      prismaQueryDiagnostics,
      explainAnalyze: {
        transactionPageRepresentative: transactionPlan?.["QUERY PLAN"],
        postingAggregateRepresentative: postingPlan?.["QUERY PLAN"],
        dashboardAggregateRepresentative: dashboardPlan?.["QUERY PLAN"],
        budgetAggregateRepresentative: budgetPlan?.["QUERY PLAN"],
      } };
  } catch (error) {
    errors.push(error);
  } finally {
    try {
      // Detect a partially created fixture without relying on a bookkeeping flag.
      const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { createdById: true } });
      if (workspace) {
        assert.equal(workspace.createdById, userId, "Refusing to delete a workspace not owned by this fixture");
        // Delete all dependent benchmark records atomically. If cleanup fails, roll it back
        // and report the failure instead of silently leaving a partially deleted fixture.
        await prisma.$transaction(async db => {
          await db.posting.deleteMany({ where: { journal: { workspaceId } } });
          await db.journal.deleteMany({ where: { workspaceId } });
          await db.transaction.deleteMany({ where: { workspaceId } });
          await db.wallet.deleteMany({ where: { workspaceId } });
          await db.budget.deleteMany({ where: { workspaceId } });
          await db.category.deleteMany({ where: { workspaceId } });
          await db.ledgerAccount.deleteMany({ where: { workspaceId } });
          await db.auditLog.deleteMany({ where: { workspaceId } });
          await db.membership.deleteMany({ where: { workspaceId } });
          await db.workspace.delete({ where: { id: workspaceId } });
        }, { timeout: 120_000, maxWait: 15_000 });
      }
      const fixtureUser = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
      if (fixtureUser) {
        assert.equal(fixtureUser.email, `${prefix}@example.invalid`, "Refusing to delete a user not owned by this fixture");
        await prisma.user.delete({ where: { id: userId } });
      }
      assert.equal(await prisma.workspace.count({ where: { id: workspaceId } }), 0);
      assert.equal(await prisma.user.count({ where: { id: userId } }), 0);
    } catch (error) {
      errors.push(new Error(`Benchmark fixture cleanup failed for ${workspaceId}`, { cause: error }));
    }
    try {
      await prisma.$disconnect();
    } catch (error) {
      errors.push(new Error("Benchmark database disconnect failed", { cause: error }));
    }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, "Benchmark failed and cleanup/disconnect also failed");
  assert.ok(output, "Benchmark did not produce a result");
  // Publish measurements only after fixture cleanup has been verified.
  await mkdir("artifacts", { recursive: true });
  await writeFile("artifacts/G7_PERFORMANCE_10000.json", JSON.stringify(output, null, 2) + "\n");
  console.log(JSON.stringify(output, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
