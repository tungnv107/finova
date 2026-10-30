/** Real PostgreSQL staging and commit; synthetic provider output, isolated QA database only. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/db";
import { previewAiStatement, reviewStatementRow } from "../src/server/ai/statements";
import { commitImport } from "../src/server/imports";
import { createWallet, walletBalances } from "../src/server/ledger";
import { seedCategories } from "../src/server/seed-categories";
import { localDay, vndDayStart } from "../src/lib/dates";

async function main() {
  const database = new URL(process.env.DATABASE_URL!);
  assert.equal(database.pathname, "/finova_ai_test_p0_20261029_a", "Use the isolated AI QA database");
  assert.ok(["127.0.0.1", "localhost"].includes(database.hostname), "Local QA database only");
  const userId = `ai_staging_${randomUUID()}`, workspaceId = `personal-${userId}`;
  const context = { userId, workspaceId, name: "Statement staging QA", image: null };
  const nativeFetch = globalThis.fetch;
  const envKeys = ["LLM__Endpoint", "LLM__ApiKey", "LLM__ChatModelId", "LLM__ApiMode", "LLM__ResponseFormat", "FINOVA_ADMIN_ENABLED", "FINOVA_USER_ACCESS_ENFORCED"];
  const savedEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  process.env.LLM__Endpoint = "https://synthetic-ai.invalid/v1";
  process.env.LLM__ApiKey = "fixture-key-never-sent";
  process.env.LLM__ChatModelId = "fixture-model";
  process.env.LLM__ApiMode = "chat-completions";
  process.env.LLM__ResponseFormat = "json_object";
  process.env.FINOVA_ADMIN_ENABLED = "0";
  process.env.FINOVA_USER_ACCESS_ENFORCED = "0";
  let createdWorkspace = false, createdUser = false;
  try {
    await prisma.user.create({ data: { id: userId, name: context.name, email: `${userId}@example.invalid` } }); createdUser = true;
    await prisma.workspace.create({ data: { id: workspaceId, name: context.name, createdById: userId } }); createdWorkspace = true;
    await seedCategories(workspaceId);
    const categories = await prisma.category.findMany({ where: { workspaceId } });
    const food = categories.find(c => c.name === "Ăn uống")!, salary = categories.find(c => c.name === "Lương")!;
    assert.ok(food && salary);
    const today = localDay(new Date());
    const wallet = await createWallet(context, { name: "Ví thử nghiệm", type: "BANK", openingBalance: "0", openingDate: vndDayStart(today).toISOString() });
    const base = { date: today, amount: "50000", kind: "EXPENSE", note: "Ăn trưa thử nghiệm", reference: "TEST-001", categoryId: food.id, confidence: 0.95, categoryConfidence: 0.95, reason: "Giao dịch thử nghiệm" };
    globalThis.fetch = (async (url, options) => {
      assert.equal(String(url), "https://synthetic-ai.invalid/v1/chat/completions");
      const body = JSON.parse(String(options?.body));
      assert.equal(body.model, "fixture-model"); assert.equal(body.response_format.type, "json_object");
      return Response.json({ choices: [{ finish_reason: "stop", message: { role: "assistant", content: "```json\n" + JSON.stringify({
        currency: "VND", complete: true, warnings: [], rows: [base, { ...base, amount: "500000", kind: "INCOME", categoryId: salary.id, note: "Lương thử nghiệm", reference: "TEST-002", confidence: 0.5 }],
      }) + "\n```" } }] });
    }) as typeof fetch;
    const text = `${today} | Chi 50000 VND | Ăn trưa thử nghiệm\n${today} | Thu 500000 VND | Lương thử nghiệm`;
    const batch = await previewAiStatement(context, text, wallet.id);
    assert.equal(batch.total, 2); assert.equal(batch.counts.VALID, 1); assert.equal(batch.counts.INVALID, 1);
    assert.equal(await prisma.transaction.count({ where: { workspaceId } }), 0, "Preview must not write transactions");
    assert.equal((await previewAiStatement(context, text, wallet.id)).id, batch.id, "Repeated preview reuses the batch");
    const uncertain = batch.rows.find(row => row.status === "INVALID")!;
    await reviewStatementRow(context, batch.id, uncertain.id, { kind: "INCOME", amount: "500000", date: today, categoryId: salary.id, destinationWalletId: null, note: "Lương thử nghiệm", confirmed: true });
    const committed = await commitImport(context, batch.id);
    assert.equal(committed.imported, 2); assert.equal(committed.remaining, 0); assert.equal(committed.batch.counts.IMPORTED, 2);
    assert.equal((await commitImport(context, batch.id)).imported, 0, "Commit must be idempotent");
    assert.equal((await walletBalances(workspaceId)).find(w => w.id === wallet.id)?.balance, "450000");
    const overlap = await previewAiStatement(context, "SAO KÊ THỬ NGHIỆM\n" + text, wallet.id);
    assert.equal(overlap.counts.DUPLICATE, 2);
    assert.equal(await prisma.transaction.count({ where: { workspaceId } }), 2);
    console.log("PASS: real PostgreSQL schema preflight, fenced JSON, text staging, review, commit, balance and duplicate prevention.");
  } finally {
    globalThis.fetch = nativeFetch;
    for (const key of envKeys) { if (savedEnv[key] === undefined) delete process.env[key]; else process.env[key] = savedEnv[key]; }
    try {
      if (createdWorkspace) {
        await prisma.importRow.deleteMany({ where: { workspaceId } });
        await prisma.importBatch.deleteMany({ where: { workspaceId } });
        await prisma.$transaction(async db => {
          await db.posting.deleteMany({ where: { journal: { workspaceId } } });
          await db.journal.deleteMany({ where: { workspaceId } });
        });
        await prisma.transaction.deleteMany({ where: { workspaceId } });
        await prisma.wallet.deleteMany({ where: { workspaceId } });
        await prisma.category.deleteMany({ where: { workspaceId } });
        await prisma.ledgerAccount.deleteMany({ where: { workspaceId } });
        await prisma.auditLog.deleteMany({ where: { workspaceId } });
        await prisma.workspace.delete({ where: { id: workspaceId } });
      }
      if (createdUser) await prisma.user.delete({ where: { id: userId } });
      console.log("PASS: QA fixture cleanup.");
    } finally { await prisma.$disconnect(); }
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
