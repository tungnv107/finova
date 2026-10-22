/** Read-only smoke test for the overview SQL against the local development DB. */
import assert from "node:assert/strict";
import { prisma } from "../src/lib/db";
import { overview } from "../src/server/reporting";
import { expenseHeatmap, historicalTrends } from "../src/server/analytics";

async function main() {
  const databaseUrl = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(databaseUrl.hostname), "Local database only");
  assert.ok(["finova", "finova_test"].includes(databaseUrl.pathname.slice(1)), "Unexpected database");
  if (process.env.NODE_ENV === "production") throw new Error("Development-only smoke test");

  const workspaces = await prisma.workspace.findMany({ take: 3, select: { id: true } });
  for (const workspace of workspaces) {
    const filter = { start: "2026-10-01", endExclusive: "2026-11-01" };
    const all = await overview(workspace.id, filter);
    assert.ok(all.kpis && Array.isArray(all.series), "Overview must return its report shape");
    const heatmap = await expenseHeatmap(workspace.id, filter);
    const trends = await historicalTrends(workspace.id, filter, 12);
    assert.ok(Array.isArray(heatmap.days) && trends.months.length === 12, "Analytics must return heatmap and trends");

    const [wallet, category] = await Promise.all([
      prisma.wallet.findFirst({ where: { workspaceId: workspace.id }, select: { id: true } }),
      prisma.category.findFirst({ where: { workspaceId: workspace.id }, select: { id: true } }),
    ]);
    for (const optionalFilter of [
      ...(wallet ? [{ walletId: wallet.id }] : []),
      ...(category ? [{ categoryId: category.id }] : []),
      ...(wallet && category ? [{ walletId: wallet.id, categoryId: category.id }] : []),
    ]) {
      const filtered = { ...filter, ...optionalFilter };
      await overview(workspace.id, filtered);
      await expenseHeatmap(workspace.id, filtered);
      await historicalTrends(workspace.id, filtered, 12);
    }
  }
  console.log(`PASS: overview, heatmap, trends SQL with wallet/category filters across ${workspaces.length} local workspaces`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
