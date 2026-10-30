/** Provider contract fixtures + real PostgreSQL/ledger. No network AI calls. */
import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { prisma } from "../src/lib/db";
import { createWallet, createTransaction, refundTransaction, walletBalances } from "../src/server/ledger";
import { seedCategories } from "../src/server/seed-categories";
import { previewAiStatement, reviewStatementRow } from "../src/server/ai/statements";
import { getImport, commitImport } from "../src/server/imports";
import { explainFinancialIntelligence, getFinancialIntelligence } from "../src/server/ai/insights";
import { suggestCategory } from "../src/server/ai/classification";
import { createBudget } from "../src/server/budgets";
import { localDay, thisMonthRange, vndDayStart } from "../src/lib/dates";
import { auth } from "../src/server/auth";

async function main() {
assert.equal(new URL(process.env.DATABASE_URL!).pathname, "/finova_ai_test_p0_20261029_a");
const id = `ai_qa_${randomUUID().replaceAll("-", "")}`;
const context = { userId: id, workspaceId: `personal-${id}`, name: "AI P0 QA", image: null };
const today = localDay(new Date());
const nativeFetch = globalThis.fetch;
const customProvider = process.argv.includes("--custom-provider");
const envKeys = ["OPENAI_API_KEY", "LLM__Endpoint", "LLM__ApiKey", "LLM__ChatModelId", "LLM__ApiMode", "LLM__ResponseFormat"];
const savedEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
for (const key of envKeys) delete process.env[key];
process.env.OPENAI_API_KEY = "fixture-key-never-sent";
let responseRows: object[] = [];
let responseOverride: object | null = null;
const responsePayload = () => responseOverride ?? { currency: "VND", complete: true, warnings: [], rows: responseRows };
// The optional custom-provider run exercises real local HTTP with synthetic output.
const upstream = createServer(async (request, response) => {
  try {
    assert.equal(request.url, "/v1/chat/completions"); assert.equal(request.method, "POST");
    assert.equal(request.headers.authorization, "Bearer local-qa-key");
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    assert.equal(body.model, "tungnv"); assert.equal(body.store, false); assert.equal(body.stream, false);
    assert.equal(body.response_format.type, "json_object"); assert.match(body.messages[0].content, /untrusted DATA/);
    assert.ok(body.messages[1].content.every((part: { type: string }) => ["text", "image_url", "file"].includes(part.type)));
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ choices: [{ finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(responsePayload()) } }] }));
  } catch { response.writeHead(500); response.end(); }
});
if (customProvider) {
  await new Promise<void>((resolve, reject) => { upstream.once("error", reject); upstream.listen(0, "127.0.0.1", resolve); });
  const address = upstream.address(); assert.ok(address && typeof address !== "string");
  process.env.LLM__Endpoint = `http://127.0.0.1:${address.port}/v1`;
  process.env.LLM__ApiKey = "local-qa-key"; process.env.LLM__ChatModelId = "tungnv";
} else globalThis.fetch = (async (url, options) => {
  assert.equal(url, "https://api.openai.com/v1/responses");
  const body = JSON.parse(String(options?.body)); assert.equal(body.store, false);
  return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(responsePayload()) }] }] });
}) as typeof fetch;
try {
  await prisma.user.create({ data: { id, name: context.name, email: `${id}@example.invalid` } });
  await prisma.workspace.create({ data: { id: context.workspaceId, name: "AI acceptance", createdById: id, memberships: { create: { userId: id } } } });
  await seedCategories(context.workspaceId);
  const categories = await prisma.category.findMany({ where: { workspaceId: context.workspaceId } });
  const food = categories.find(c => c.name === "Ăn uống")!, salary = categories.find(c => c.name === "Lương")!;
  const wallet = await createWallet(context, { name: "Ví kiểm thử AI", type: "BANK", openingBalance: "1000000", openingDate: vndDayStart(today).toISOString() });
  const destination = await createWallet(context, { name: "Ví tiết kiệm QA", type: "CASH", openingBalance: "0", openingDate: vndDayStart(today).toISOString() });
  const base = { date: today, amount: "50000", kind: "EXPENSE", note: "Ăn trưa QA", reference: "qa-ref-1", categoryId: food.id, confidence: 0.99, categoryConfidence: 0.99, reason: "Ăn uống" };
  responseRows = [base, { ...base, reference: "qa-ref-2", amount: "70000", confidence: 0.3 }, { ...base, reference: "qa-ref-3", kind: "INCOME", amount: "500000", categoryId: salary.id }];
  const file = new File(["%PDF-1.4\nQA fixture"], "statement.pdf");
  const staged = await previewAiStatement(context, file, wallet.id);
  assert.equal(staged.counts.VALID, 2); assert.equal(staged.counts.INVALID, 1);
  assert.equal(await prisma.transaction.count({ where: { workspaceId: context.workspaceId } }), 0, "preview must not write ledger");
  await assert.rejects(() => getImport("foreign", staged.id), { code: "NOT_FOUND" });
  const uncertain = staged.rows.find(r => r.needsReview)!;
  await assert.rejects(() => reviewStatementRow({ ...context, workspaceId: "foreign" }, staged.id, uncertain.id, { kind: "EXPENSE", amount: "70000", date: today, categoryId: food.id, destinationWalletId: null, note: "Ăn trưa QA", confirmed: true }), { code: "ROW_NOT_EDITABLE" });
  await assert.rejects(() => reviewStatementRow(context, staged.id, uncertain.id, { kind: "EXPENSE", amount: "70000", date: today, categoryId: salary.id, destinationWalletId: null, note: "Ăn trưa QA", confirmed: true }), { code: "INVALID_CATEGORY" });
  await reviewStatementRow(context, staged.id, uncertain.id, { kind: "EXPENSE", amount: "70000", date: today, categoryId: food.id, destinationWalletId: null, note: "Ăn trưa QA", confirmed: true });
  const commits = await Promise.all([commitImport(context, staged.id), commitImport(context, staged.id)]);
  assert.equal(commits.reduce((s, c) => s + c.imported, 0), 3);
  assert.equal((await commitImport(context, staged.id)).imported, 0);
  assert.equal((await previewAiStatement(context, file, wallet.id)).id, staged.id, "same upload reuses its staging batch");
  const overlapping = await previewAiStatement(context, new File(["%PDF-1.4\nsecond export"], "overlap.pdf"), wallet.id);
  assert.equal(overlapping.counts.DUPLICATE, 3);
  await commitImport(context, overlapping.id);
  assert.equal(await prisma.transaction.count({ where: { workspaceId: context.workspaceId } }), 3);
  const expense = await prisma.transaction.findFirstOrThrow({ where: { workspaceId: context.workspaceId, amount: "50000" } });
  await refundTransaction(context, expense.id, { amount: "20000", note: "QA refund" }, "qa-refund");
  await createTransaction(context, { kind: "TRANSFER", walletId: wallet.id, destinationWalletId: destination.id, amount: "100000", feeAmount: "1000", occurredAt: vndDayStart(today).toISOString() }, "qa-transfer");
  const report = await getFinancialIntelligence(context.workspaceId);
  assert.equal(report.totals.expense, "101000", "net expense includes refund and transfer fee, excludes transfer principal");
  assert.equal(report.totals.income, "500000");
  assert.equal(report.totals.surplus, "399000");
  assert.equal((await walletBalances(context.workspaceId)).find(w => w.id === wallet.id)?.balance, "1299000");
  assert.equal((await suggestCategory(context.workspaceId, "Ăn trưa QA", "EXPENSE")).categoryId, food.id);
  responseOverride = { categoryId: food.id, confidence: 0.8, reason: "QA provider suggestion" };
  const suggestion = await suggestCategory(context.workspaceId, "Unknown QA service", "EXPENSE", true);
  assert.equal(suggestion.source, "AI"); assert.equal(suggestion.categoryId, food.id);
  responseOverride = { summary: "QA narrative", observations: ["QA observation"], recommendations: ["QA recommendation"] };
  assert.equal((await explainFinancialIntelligence(context.workspaceId)).narrative.summary, "QA narrative");
  responseOverride = null;
  const period = thisMonthRange();
  await createBudget(context, { name: "Ăn uống thông minh", scope: "CATEGORY", period: "MONTHLY", ...period, limitAmount: "90000", categoryIds: [food.id] });
  assert.equal((await getFinancialIntelligence(context.workspaceId)).forecasts[0].risk, "OVER");
  // Leave a fresh uncertain row for the signed-session browser acceptance run.
  responseRows = [{ ...base, reference: "qa-browser", amount: "12345", confidence: 0.2 }];
  const browserBatch = await previewAiStatement(context, new File(["%PDF-1.4\nbrowser"], "browser-statement.pdf"), wallet.id);
  const token = randomUUID();
  await prisma.session.create({ data: { id: randomUUID(), token, userId: id, expiresAt: new Date(Date.now() + 3600000) } });
  const configuration = await auth.$context;
  const signature = createHmac("sha256", configuration.secret).update(token).digest("base64");
  await mkdir("artifacts/ai-p0", { recursive: true });
  await writeFile("artifacts/ai-p0/browser-fixture.json", JSON.stringify({ cookie: `${configuration.authCookies.sessionToken.name}=${encodeURIComponent(`${token}.${signature}`)}`, batchId: browserBatch.id, workspaceId: context.workspaceId, categoryId: food.id, walletId: wallet.id, today }));
  console.log(`PASS (${customProvider ? "custom provider over real local HTTP" : "OpenAI Responses fixture"}): real PostgreSQL staging, review, tenant isolation, concurrent commit, repeated import, refund, transfer, insights, AI classification/narrative, budgets. Browser fixture prepared in isolated QA DB.`);
} finally {
  globalThis.fetch = nativeFetch;
  for (const key of envKeys) { if (savedEnv[key] === undefined) delete process.env[key]; else process.env[key] = savedEnv[key]; }
  if (upstream.listening) await new Promise<void>((resolve, reject) => upstream.close(error => error ? reject(error) : resolve()));
  await prisma.$disconnect();
}
}
main().catch(error => { console.error(error); process.exitCode = 1; });
