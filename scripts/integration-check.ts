/* Chỉ chạy trên database DEVELOPMENT/TEST. Mỗi lần dùng workspace riêng và xóa toàn bộ dữ liệu thử. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/db";
import { createWallet, updateWallet, createTransaction, createTransactionInDb, editTransaction, refundTransaction, listTransactionsPage, walletBalances, validateBalanced, voidTransaction } from "../src/server/ledger";
import { serializable } from "../src/server/serializable";
import { seedCategories } from "../src/server/seed-categories";
import { createCategory, listCategories, updateCategory } from "../src/server/categories";
import { bootstrapPersonalWorkspace } from "../src/server/bootstrap";
import { overview } from "../src/server/reporting";
import { Decimal, normalAmount } from "../src/lib/money";
import { cycleDates, localDay, vndDayStart } from "../src/lib/dates";
import { createBudget, updateBudget, listBudgetPerformance } from "../src/server/budgets";
import { expenseHeatmap, historicalTrends } from "../src/server/analytics";
import { transactionsCsv } from "../src/server/csv-export";
import { reportXlsx, reportPdf } from "../src/server/file-exports";
import { allocateGoal, createGoal, listGoals, updateGoal } from "../src/server/goals";
import { createDebt, listDebts, payDebt, updateDebt } from "../src/server/debts";
import { createCreditCard, createCardEntry, listCreditCards, updateCreditCard } from "../src/server/credit-cards";
import { netWorth } from "../src/server/net-worth";
import { createRule, generateOccurrences, processOccurrence, skipOccurrence, syncRecurring, updateRule } from "../src/server/recurring";
import { commitImport, getImport, previewImport, retryFailedImport } from "../src/server/imports";
import { listNotifications, markNotification, reconcileNotifications } from "../src/server/notifications";
import { auditLedger } from "./reconcile-ledger";
import { walletLedgerDetail } from "../src/server/wallet-detail";
import { transactionDetail } from "../src/server/transaction-detail";
import { listWalletReconciliations, reconcileWallet } from "../src/server/wallet-reconciliation";
import ExcelJS from "exceljs";

function summaryValue(sheet: ExcelJS.Worksheet, name: string) {
  const row = sheet.findRow(1);
  assert.ok(row, "Missing summary header");
  for (let index = 2; index <= sheet.rowCount; index++) {
    if (sheet.getCell(`A${index}`).value === name) return sheet.getCell(`B${index}`).value;
  }
  throw new Error(`Missing summary metric: ${name}`);
}

// Independent, posting-level oracle for the PostgreSQL dashboard aggregate.
// Run only against the disposable integration workspaces, never a large dataset.
async function assertOverviewMatchesLedger(workspaceId: string, filter: {
  start: string; endExclusive: string; walletId?: string; categoryId?: string;
}) {
  const postings = await prisma.posting.findMany({
    where: { journal: { workspaceId, effectiveAt: {
      gte: vndDayStart(filter.start), lt: vndDayStart(filter.endExclusive),
    }, ...(filter.walletId ? { walletId: filter.walletId } : {}) } },
    select: {
      side: true, amount: true,
      journal: { select: { effectiveAt: true } },
      account: { select: { workspaceId: true, id: true, name: true, code: true, kind: true,
        category: { select: { id: true, name: true, color: true } },
      } },
    },
  });
  const dayTotals = new Map<string, { income: Decimal; expense: Decimal }>();
  const expenseCategories = new Map<string, { id: string; name: string; color: string; amount: Decimal }>();
  let income = new Decimal(0), expense = new Decimal(0);
  for (const posting of postings) {
    const account = posting.account;
    assert.equal(account.workspaceId, workspaceId, "Unexpected foreign ledger account");
    if (account.kind !== "INCOME" && account.kind !== "EXPENSE") continue;
    if (filter.categoryId && account.category?.id !== filter.categoryId) continue;
    const amount = normalAmount(account.kind, posting.side, posting.amount.toString());
    const day = localDay(posting.journal.effectiveAt);
    const totals = dayTotals.get(day) ?? { income: new Decimal(0), expense: new Decimal(0) };
    if (account.kind === "INCOME") {
      income = income.plus(amount);
      totals.income = totals.income.plus(amount);
    } else {
      expense = expense.plus(amount);
      totals.expense = totals.expense.plus(amount);
      const category = account.category
        ? { id: account.category.id, name: account.category.name, color: account.category.color }
        : { id: account.code === "EXPENSE_TRANSFER_FEE" ? "ledger:transfer-fee" : `ledger:${account.id}`, name: account.name, color: "#94A3B8" };
      const current = expenseCategories.get(category.id) ?? { ...category, amount: new Decimal(0) };
      current.amount = current.amount.plus(amount);
      expenseCategories.set(category.id, current);
    }
    dayTotals.set(day, totals);
  }

  const actual = await overview(workspaceId, filter);
  const label = JSON.stringify(filter);
  assert.equal(actual.kpis.income, income.toFixed(0), `${label}: income`);
  assert.equal(actual.kpis.expense, expense.toFixed(0), `${label}: expense`);
  assert.equal(actual.kpis.surplus, income.minus(expense).toFixed(0), `${label}: surplus`);
  assert.deepEqual(actual.series, [...dayTotals.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([date, totals]) => ({ date, income: totals.income.toFixed(0), expense: totals.expense.toFixed(0),
      surplus: totals.income.minus(totals.expense).toFixed(0) })), `${label}: daily series`);
  assert.deepEqual([...actual.categories].sort((a, b) => a.id.localeCompare(b.id)),
    [...expenseCategories.values()].sort((a, b) => a.id.localeCompare(b.id))
      .map(category => ({ ...category, amount: category.amount.toFixed(0) })), `${label}: category breakdown`);
  assert.equal(actual.categories.reduce((sum, row) => sum.plus(row.amount), new Decimal(0)).toFixed(0),
    actual.kpis.expense, `${label}: category totals`);
}

async function main() {
  if (process.env.FINOVA_TEST_RUN !== "1" || process.env.NODE_ENV === "production") {
    throw new Error("Chỉ chạy khi FINOVA_TEST_RUN=1 và NODE_ENV khác production; dùng database phát triển.");
  }
  const databaseUrl = new URL(process.env.DATABASE_URL ?? "");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(databaseUrl.hostname) || !["finova", "finova_test"].includes(databaseUrl.pathname.slice(1))) {
    throw new Error("Integration test chỉ được chạy với PostgreSQL Finova cục bộ (finova/finova_test).");
  }
  const createdUsers: string[] = [];
  const createdWorkspaces: string[] = [];
  const occurredAt = "2026-10-12T10:00:00+07:00";
  try {
    await prisma.$connect();
    async function setup() {
      const userId = `integration-${randomUUID()}`;
      const workspaceId = `integration-${randomUUID()}`;
      await prisma.user.create({ data: { id: userId, name: "Finova Integration", email: `${userId}@example.invalid` } });
      createdUsers.push(userId);
      await prisma.workspace.create({ data: { id: workspaceId, name: "Integration test", createdById: userId, memberships: { create: { userId } } } });
      createdWorkspaces.push(workspaceId);
      await seedCategories(workspaceId);
      return { workspaceId, userId, name: "Integration", image: null };
    }
    const a = await setup();
    const b = await setup();
    const bootUserId = `integration-${randomUUID()}`;
    await prisma.user.create({ data: { id: bootUserId, name: "Bootstrap Concurrent", email: `${bootUserId}@example.invalid` } });
    createdUsers.push(bootUserId);
    const bootWorkspaceId = `personal-${bootUserId}`;
    createdWorkspaces.push(bootWorkspaceId);
    const bootstraps = await Promise.all(Array.from({ length: 4 }, () => bootstrapPersonalWorkspace({ id: bootUserId, name: "Bootstrap Concurrent" })));
    assert.ok(bootstraps.every(id => id === bootWorkspaceId));
    assert.equal(await prisma.category.count({ where: { workspaceId: bootWorkspaceId } }), 16);
    assert.equal(await prisma.membership.count({ where: { workspaceId: bootWorkspaceId, userId: bootUserId } }), 1);
    assert.equal(await prisma.userPreferences.count({ where: { userId: bootUserId } }), 1);
    const walletA = await createWallet(a, { name: "A", type: "CASH", openingBalance: "2000000", openingDate: occurredAt });
    const walletB = await createWallet(a, { name: "B", type: "BANK", openingBalance: "1000000", openingDate: occurredAt });
    const foreign = await createWallet(b, { name: "B foreign", type: "CASH", openingBalance: "0", openingDate: occurredAt });
    await updateWallet(a, walletB.id, { name: "Ngân hàng chính", includeInAvailable: false });
    assert.equal((await prisma.ledgerAccount.findUniqueOrThrow({ where: { id: walletB.ledgerAccountId } })).name, "Ngân hàng chính");
    assert.equal((await overview(a.workspaceId, { start: "2026-10-01", endExclusive: "2026-11-01" })).kpis.available, "2000000");
    await assert.rejects(updateWallet(b, walletA.id, { name: "Tên ngoài phạm vi" }), /Không tìm thấy ví/);
    await assert.rejects(updateWallet(b, walletA.id, { archived: true }), /Không tìm thấy ví/);
    assert.equal((await prisma.wallet.findUniqueOrThrow({ where: { id: walletA.id } })).archivedAt, null);
    await updateWallet(a, walletB.id, { includeInAvailable: true });
    const categoryIncome = await prisma.category.findFirstOrThrow({ where: { workspaceId: a.workspaceId, name: "Lương" } });
    const categoryExpense = await prisma.category.findFirstOrThrow({ where: { workspaceId: a.workspaceId, name: "Ăn uống" } });

    // CRUD danh mục: tạo account cùng workspace, sửa tên, lưu trữ/khôi phục và chặn truy cập chéo.
    const custom = await createCategory(a, { kind: "EXPENSE", name: "Danh mục kiểm thử", icon: "Circle", color: "#18C5C2" });
    assert.equal((await prisma.ledgerAccount.findUniqueOrThrow({ where: { id: custom.ledgerAccountId } })).workspaceId, a.workspaceId);
    await updateCategory(a, custom.id, { name: "Danh mục đã sửa", color: "#1E5EFF" });
    assert.equal((await prisma.ledgerAccount.findUniqueOrThrow({ where: { id: custom.ledgerAccountId } })).name, "Danh mục đã sửa");
    // T02.07: category hierarchy remains scoped, acyclic and does not rewrite ledger history.
    const child = await createCategory(a, { kind: "EXPENSE", name: "Danh mục con kiểm thử", parentId: custom.id });
    assert.equal((await prisma.category.findUniqueOrThrow({ where: { id: child.id } })).parentId, custom.id);
    assert.equal((await listCategories(a.workspaceId)).find(c => c.id === child.id)?.parentId, custom.id);
    await assert.rejects(updateCategory(a, custom.id, { parentId: child.id }), /vòng lặp/);
    await assert.rejects(updateCategory(a, custom.id, { parentId: custom.id }), /vòng lặp/);
    await assert.rejects(updateCategory(a, custom.id, { archived: true }), /danh mục con/);
    await assert.rejects(updateCategory(a, child.id, { parentId: categoryIncome.id }), /cùng loại/);
    const foreignParent = await prisma.category.findFirstOrThrow({ where: { workspaceId: b.workspaceId, kind: "EXPENSE" } });
    await assert.rejects(updateCategory(a, child.id, { parentId: foreignParent.id }), /Không tìm thấy danh mục cha/);
    await assert.rejects(prisma.category.update({ where: { id: child.id }, data: { parentId: foreignParent.id } }));
    await assert.rejects(prisma.category.update({ where: { id: custom.id }, data: { parentId: child.id } }));
    await updateCategory(a, child.id, { archived: true });
    await assert.rejects(updateCategory(b, custom.id, { name: "Chiếm quyền" }), /Không tìm thấy danh mục/);
    await updateCategory(a, custom.id, { archived: true });
    assert.equal((await listCategories(a.workspaceId)).some(c => c.id === custom.id), false);
    assert.equal((await listCategories(a.workspaceId, true)).some(c => c.id === custom.id), true);
    await updateCategory(a, custom.id, { archived: false });
    await updateCategory(a, child.id, { archived: false, parentId: categoryExpense.id });
    assert.equal((await prisma.category.findUniqueOrThrow({ where: { id: child.id } })).parentId, categoryExpense.id);
    await updateCategory(a, child.id, { parentId: null });
    assert.equal((await prisma.category.findUniqueOrThrow({ where: { id: child.id } })).parentId, null);
    assert.equal((await listCategories(a.workspaceId)).some(c => c.id === custom.id), true);
    await assert.rejects(createCategory(b, { kind: "TRANSFER", name: "Invalid" }), /Invalid option/);

    // AT-02: workspace isolation (domain service authorization).
    await assert.rejects(createTransaction(a, { kind: "EXPENSE", walletId: foreign.id, categoryId: categoryExpense.id, amount: "5", occurredAt }), /Ví không tồn tại/);
    await assert.rejects(prisma.transaction.create({ data: {
      workspaceId: a.workspaceId, walletId: foreign.id, categoryId: categoryExpense.id, kind: "EXPENSE",
      amount: "5", occurredAt: new Date(occurredAt), createdById: a.userId,
    } }), /Foreign key constraint/);

    // DB-level deferred constraint: raw Prisma writes must not bypass ledger rules.
    await assert.rejects(prisma.$transaction(async (db) => {
      await db.journal.create({ data: { workspaceId: a.workspaceId, kind: "INVALID_EMPTY", effectiveAt: new Date(occurredAt) } });
    }));
    assert.equal(await prisma.journal.count({ where: { workspaceId: a.workspaceId, kind: "INVALID_EMPTY" } }), 0);
    await assert.rejects(prisma.$transaction(async (db) => {
      await db.journal.create({ data: {
        workspaceId: a.workspaceId, kind: "INVALID_FOREIGN_POSTING", effectiveAt: new Date(occurredAt),
        postings: { create: [
          { ledgerAccountId: walletA.ledgerAccountId, side: "DEBIT", amount: "100", currency: "VND" },
          { ledgerAccountId: foreign.ledgerAccountId, side: "CREDIT", amount: "100", currency: "VND" },
        ] },
      } });
    }));
    assert.equal(await prisma.journal.count({ where: { workspaceId: a.workspaceId, kind: "INVALID_FOREIGN_POSTING" } }), 0);

    // AT-03: transfer A→B không tăng thu/chi.
    const transferInput = { kind: "TRANSFER" as const, walletId: walletA.id, destinationWalletId: walletB.id, amount: "500000", occurredAt };
    const key = randomUUID();
    const transfer = await createTransaction(a, transferInput, key);
    assert.equal((await createTransaction(a, transferInput, key)).id, transfer.id);
    const balances = await walletBalances(a.workspaceId, new Date("2026-10-13T00:00:00Z"));
    assert.deepEqual(balances.map(x => x.balance), ["1500000", "1500000"]);
    const historyA = await walletLedgerDetail(a.workspaceId, walletA.id, "2026-10-12");
    assert.equal(historyA.wallet.balance, "1500000");
    assert.equal(historyA.entries.reduce((sum, entry) => sum.plus(entry.change), new Decimal(0)).toFixed(0), "1500000");
    assert.equal(historyA.entries.some(entry => entry.transactionId === transfer.id && entry.change === "-500000"), true);
    const beforeOpening = await walletLedgerDetail(a.workspaceId, walletA.id, "2026-10-11");
    assert.equal(beforeOpening.wallet.balance, "0");
    assert.equal(beforeOpening.entries.length, 0);
    await assert.rejects(walletLedgerDetail(b.workspaceId, walletA.id, "2026-10-12"), /Không tìm thấy ví/);
    await assert.rejects(walletLedgerDetail(a.workspaceId, walletA.id, "2026-10-12", "foreign-cursor"), /Trang lịch sử/);
    let r = await overview(a.workspaceId, { start: "2026-10-01", endExclusive: "2026-11-01" });
    assert.equal(r.kpis.income, "0"); assert.equal(r.kpis.expense, "0");

    // T02.10: fee is a real ledger expense, debited once from the source wallet.
    const transferWithFee = { ...transferInput, amount: "100000", feeAmount: "5000" };
    const feeKey = randomUUID();
    const charged = await createTransaction(a, transferWithFee, feeKey);
    assert.equal((await createTransaction(a, transferWithFee, feeKey)).id, charged.id);
    await assert.rejects(createTransaction(a, { ...transferWithFee, feeAmount: "5001" }, feeKey), /Khóa giao dịch/);
    assert.equal((await prisma.transaction.findUniqueOrThrow({ where: { id: charged.id } })).feeAmount.toString(), "5000");
    assert.deepEqual((await walletBalances(a.workspaceId, new Date("2026-10-13T00:00:00Z"))).map(w => w.balance), ["1395000", "1600000"]);
    let feeOverview = await overview(a.workspaceId, { start: "2026-10-01", endExclusive: "2026-11-01" });
    assert.equal(feeOverview.kpis.expense, "5000");
    assert.equal(feeOverview.kpis.income, "0");
    assert.equal(feeOverview.categories.find(c => c.name === "Phí chuyển tiền")?.amount, "5000");
    assert.equal(feeOverview.categories.find(c => c.id === "ledger:transfer-fee")?.amount, "5000");
    const feeList = await listTransactionsPage(a.workspaceId, { kind: "TRANSFER", feeOnly: true, from: new Date("2026-10-01T00:00:00+07:00"), to: new Date("2026-11-01T00:00:00+07:00") });
    assert.ok(feeList.items.some(row => row.id === charged.id && row.feeAmount === "5000"));
    assert.ok(feeList.items.every(row => row.kind === "TRANSFER" && Number(row.feeAmount) > 0));
    assert.equal((await listTransactionsPage(a.workspaceId, { limit: 100 })).items.find(row => row.id === charged.id)?.feeAmount, "5000");
    const feeEdited = await editTransaction(a, charged.id, { ...transferWithFee, amount: "80000", feeAmount: "2000", version: charged.version });
    assert.deepEqual((await walletBalances(a.workspaceId, new Date("2026-10-13T00:00:00Z"))).map(w => w.balance), ["1418000", "1580000"]);
    feeOverview = await overview(a.workspaceId, { start: "2026-10-01", endExclusive: "2026-11-01" });
    assert.equal(feeOverview.kpis.expense, "2000");
    await voidTransaction(a, charged.id, feeEdited.version);
    assert.deepEqual((await walletBalances(a.workspaceId, new Date("2026-10-13T00:00:00Z"))).map(w => w.balance), ["1500000", "1500000"]);
    feeOverview = await overview(a.workspaceId, { start: "2026-10-01", endExclusive: "2026-11-01" });
    assert.equal(feeOverview.kpis.expense, "0");
    assert.equal(feeOverview.categories.reduce((sum, c) => sum.plus(c.amount), new Decimal(0)).toFixed(0), "0");
    assert.equal(await prisma.journal.count({ where: { workspaceId: a.workspaceId, transactionId: charged.id } }), 4);

    // T02.12: tags survive create, idempotent replay, edit and list/detail DTOs.
    const taggedInput = { kind: "EXPENSE" as const, walletId: walletA.id,
      categoryId: categoryExpense.id, amount: "123", occurredAt,
      tags: ["Ăn uống", "Công việc"] };
    const taggedKey = randomUUID();
    const tagged = await createTransaction(a, taggedInput, taggedKey);
    assert.deepEqual(tagged.tags, ["Ăn uống", "Công việc"]);
    assert.equal((await createTransaction(a, taggedInput, taggedKey)).id, tagged.id);
    await assert.rejects(createTransaction(a, { ...taggedInput, tags: ["Khác"] }, taggedKey), /Khóa giao dịch/);
    const updatedTags = await editTransaction(a, tagged.id, { ...taggedInput, tags: ["Đã sửa"], version: tagged.version });
    assert.deepEqual(updatedTags.tags, ["Đã sửa"]);
    assert.deepEqual((await transactionDetail(a.workspaceId, tagged.id))?.tags, ["Đã sửa"]);
    assert.equal(await transactionDetail(b.workspaceId, tagged.id), null);
    assert.deepEqual((await listTransactionsPage(a.workspaceId, { limit: 100 })).items.find(row => row.id === tagged.id)?.tags, ["Đã sửa"]);
    await voidTransaction(a, tagged.id, updatedTags.version);

    // AT-04/05/06/14: thu, chi, edit bằng reversal, refund ròng đúng category/KPI.
    await createTransaction(a, { kind: "INCOME", walletId: walletA.id, categoryId: categoryIncome.id, amount: "15000000", occurredAt });
    const expense = await createTransaction(a, { kind: "EXPENSE", walletId: walletA.id, categoryId: categoryExpense.id, amount: "500000", occurredAt });
    const journalCountBeforeForeignEdit = await prisma.journal.count({ where: { workspaceId: a.workspaceId } });
    const auditCountBeforeForeignEdit = await prisma.auditLog.count({ where: { workspaceId: a.workspaceId } });
    await assert.rejects(editTransaction(b, expense.id, { kind: "EXPENSE", walletId: foreign.id, categoryId: categoryExpense.id,
      amount: "1", occurredAt, version: expense.version }), /Không tìm thấy giao dịch/);
    await assert.rejects(voidTransaction(b, expense.id, expense.version), /Không tìm thấy giao dịch/);
    assert.equal((await prisma.transaction.findUniqueOrThrow({ where: { id: expense.id } })).version, expense.version);
    assert.equal(await prisma.journal.count({ where: { workspaceId: a.workspaceId } }), journalCountBeforeForeignEdit);
    assert.equal(await prisma.auditLog.count({ where: { workspaceId: a.workspaceId } }), auditCountBeforeForeignEdit);
    const edited = await editTransaction(a, expense.id, { kind: "EXPENSE", walletId: walletA.id, categoryId: categoryExpense.id, amount: "300000", occurredAt, version: expense.version });
    await refundTransaction(a, expense.id, { amount: "100000" });
    // T03.05: chart drill-through includes expenses and refunds at any nested depth,
    // while the pre-existing direct-category API filter keeps its original meaning.
    await updateCategory(a, child.id, { parentId: categoryExpense.id });
    const grandchild = await createCategory(a, { kind: "EXPENSE", name: "Nhánh sâu kiểm thử", parentId: child.id });
    const nestedExpense = await createTransaction(a, { kind: "EXPENSE", walletId: walletA.id,
      categoryId: grandchild.id, amount: "125", occurredAt });
    const nestedRefund = await refundTransaction(a, nestedExpense.id, { amount: "125" });
    const directRows = await listTransactionsPage(a.workspaceId, { categoryId: categoryExpense.id, kind: "EXPENSE", includeRefunds: true });
    const branchRows = await listTransactionsPage(a.workspaceId, { categoryId: categoryExpense.id, categoryScope: "subtree", kind: "EXPENSE", includeRefunds: true });
    assert.ok(!directRows.items.some(row => row.id === nestedExpense.id || row.id === nestedRefund.id));
    assert.ok(branchRows.items.some(row => row.id === nestedExpense.id));
    assert.ok(branchRows.items.some(row => row.id === nestedRefund.id));
    await assert.rejects(listTransactionsPage(b.workspaceId, { categoryId: categoryExpense.id, categoryScope: "subtree" }), /Danh mục không thuộc/);
    await updateCategory(a, grandchild.id, { archived: true });
    assert.ok((await listTransactionsPage(a.workspaceId, { categoryId: categoryExpense.id, categoryScope: "subtree" }))
      .items.some(row => row.id === nestedExpense.id), "Archived category descendants remain in history");
    r = await overview(a.workspaceId, { start: "2026-10-01", endExclusive: "2026-11-01" });
    assert.equal(r.kpis.income, "15000000"); assert.equal(r.kpis.expense, "200000");
    assert.equal(r.kpis.surplus, "14800000"); assert.equal(r.kpis.available, "17800000");
    assert.equal(r.kpis.netWorth, r.worth.current.netWorth);
    assert.equal(r.comparison.mode, "equal_calendar_days");
    assert.equal(r.comparison.start, "2026-08-31");
    assert.equal(r.comparison.endExclusive, "2026-10-01");
    assert.equal(r.comparison.changes.income.change, r.kpis.income);
    assert.equal(r.comparison.changes.income.percent, null, "Previous period zero is N/A, not Infinity");
    assert.equal(r.kpis.budgetUsage, null, "Without a matching budget, show unconfigured state");
    assert.equal(r.categories.reduce((s, c) => s.plus(c.amount), new Decimal(0)).toString(), r.kpis.expense);
    assert.equal(r.series.reduce((s, d) => s.plus(d.expense), new Decimal(0)).toString(), r.kpis.expense);

    // P4 budget performance uses net ledger expense (reversals, refunds, transfers).
    const budgetFields = { name: "Ăn uống tháng 10", scope: "CATEGORY" as const, period: "MONTHLY" as const,
      start: "2026-10-01", endExclusive: "2026-11-01", limitAmount: "250000", categoryIds: [categoryExpense.id] };
    const budget = await createBudget(a, budgetFields);
    let dashboardBudget = (await overview(a.workspaceId, { start: "2026-10-01", endExclusive: "2026-11-01" })).kpis.budgetUsage;
    assert.equal(dashboardBudget?.budgetId, budget.id);
    assert.equal(dashboardBudget?.percent, "80");
    let budgetReport = (await listBudgetPerformance(a.workspaceId)).find(x => x.id === budget.id)!;
    assert.equal(budgetReport.used, "200000"); assert.equal(budgetReport.percent, "80");
    assert.deepEqual(budgetReport.thresholds, ["P50", "P80"]);
    await assert.rejects(createBudget(b, { ...budgetFields, name: "Foreign", categoryIds: [categoryExpense.id] }), /workspace khác/);
    await assert.rejects(updateBudget(b, budget.id, { name: "Foreign update" }), /Không tìm thấy ngân sách/);
    await assert.rejects(createBudget(a, { ...budgetFields, name: "Đếm trùng" }), /đã thuộc ngân sách khác/);
    await createBudget(a, { ...budgetFields, name: "Tổng chi riêng", scope: "TOTAL", categoryIds: [], limitAmount: "1000000" });
    dashboardBudget = (await overview(a.workspaceId, { start: "2026-10-01", endExclusive: "2026-11-01" })).kpis.budgetUsage;
    assert.equal(dashboardBudget?.scope, "TOTAL", "Overlapping budgets must not be summed");
    assert.equal(dashboardBudget?.used, "200000");
    assert.equal(dashboardBudget?.percent, "20");
    assert.equal((await overview(a.workspaceId, { start: "2026-10-01", endExclusive: "2026-11-01", walletId: walletA.id })).kpis.budgetUsage,
      null, "Filtered report must not label workspace budget usage as filtered");
    const crossing = await createTransaction(a, { kind: "EXPENSE", walletId: walletA.id, categoryId: categoryExpense.id, amount: "75000", occurredAt });
    budgetReport = (await listBudgetPerformance(a.workspaceId)).find(x => x.id === budget.id)!;
    assert.equal(budgetReport.used, "275000"); assert.equal(budgetReport.percent, "110");
    assert.deepEqual(budgetReport.thresholds, ["P50", "P80", "P100", "OVER100"]);
    assert.equal(await prisma.budgetAlert.count({ where: { budgetId: budget.id } }), 4);
    const crossingRefund = await refundTransaction(a, crossing.id, { amount: "50000" });
    budgetReport = (await listBudgetPerformance(a.workspaceId)).find(x => x.id === budget.id)!;
    assert.equal(budgetReport.used, "225000"); assert.equal(budgetReport.percent, "90");
    assert.equal(await prisma.budgetAlert.count({ where: { budgetId: budget.id, resolvedAt: { not: null } } }), 2);
    await voidTransaction(a, crossingRefund.id, crossingRefund.version);
    await listBudgetPerformance(a.workspaceId);
    assert.equal(await prisma.budgetAlert.count({ where: { budgetId: budget.id, resolvedAt: null } }), 4);
    assert.equal(await prisma.budgetAlert.count({ where: { budgetId: budget.id } }), 4, "No duplicate alerts on recrossing");
    await voidTransaction(a, crossing.id, crossing.version);
    budgetReport = (await listBudgetPerformance(a.workspaceId)).find(x => x.id === budget.id)!;
    assert.equal(budgetReport.used, "200000");
    const revised = await updateBudget(a, budget.id, { limitAmount: "500000", name: "Ăn uống cập nhật" });
    assert.equal(revised.name, "Ăn uống cập nhật");
    assert.equal((await listBudgetPerformance(a.workspaceId)).find(x => x.id === budget.id)!.percent, "40");
    await updateBudget(a, budget.id, { archived: true });
    assert.ok(!(await listBudgetPerformance(a.workspaceId)).some(x => x.id === budget.id));
    // Aggregation must join category ledger accounts (GROUP) without counting
    // unrelated expense accounts or another workspace's journals.
    const groupBudget = await createBudget(a, {
      ...budgetFields, name: "Nhóm chi tiêu", scope: "GROUP",
      categoryIds: [categoryExpense.id, custom.id], limitAmount: "400000",
    });
    const groupReport = (await listBudgetPerformance(a.workspaceId)).find(x => x.id === groupBudget.id)!;
    assert.equal(groupReport.used, "200000");
    assert.deepEqual(groupReport.thresholds, ["P50"]);
    await Promise.all(Array.from({ length: 3 }, () => listBudgetPerformance(a.workspaceId)));
    assert.equal(await prisma.budgetAlert.count({ where: { budgetId: groupBudget.id } }), 1,
      "Concurrent reads must not duplicate GROUP budget alerts");
    await updateBudget(a, groupBudget.id, { archived: true });
    await updateBudget(a, budget.id, { archived: false });
    assert.ok((await listBudgetPerformance(a.workspaceId)).some(x => x.id === budget.id));

    const monthlyFilter = { start: "2026-10-01", endExclusive: "2026-11-01" };
    const heatmap = await expenseHeatmap(a.workspaceId, monthlyFilter);
    assert.equal(heatmap.days.length, 31);
    assert.equal(heatmap.days.reduce((s, d) => s.plus(d.expense), new Decimal(0)).toString(),
      (await overview(a.workspaceId, monthlyFilter)).kpis.expense);
    const trends = await historicalTrends(a.workspaceId, monthlyFilter, 12);
    assert.equal(trends.months.length, 12);
    assert.equal(trends.months.at(-1)!.expense, (await overview(a.workspaceId, monthlyFilter)).kpis.expense);
    await assert.rejects(expenseHeatmap(b.workspaceId, { ...monthlyFilter, categoryId: categoryExpense.id }), /Danh mục không thuộc/);
    await assert.rejects(historicalTrends(b.workspaceId, { ...monthlyFilter, walletId: walletA.id }), /Ví không thuộc/);
    // UTC timestamps must be grouped by Vietnamese local date, even across months.
    const boundary = await createTransaction(a, { kind: "EXPENSE", walletId: walletA.id,
      categoryId: categoryExpense.id, amount: "17", occurredAt: "2026-11-01T00:15:00+07:00" });
    const november = await expenseHeatmap(a.workspaceId, { start: "2026-11-01", endExclusive: "2026-12-01" });
    assert.equal(november.days.find(d => d.date === "2026-11-01")?.expense, "17");
    const novemberTrend = await historicalTrends(a.workspaceId, { start: "2026-11-01", endExclusive: "2026-12-01" }, 6);
    assert.equal(novemberTrend.months.at(-1)?.expense, "17");
    await voidTransaction(a, boundary.id, boundary.version);
    assert.equal((await expenseHeatmap(a.workspaceId, { start: "2026-11-01", endExclusive: "2026-12-01" }))
      .days.find(d => d.date === "2026-11-01")?.expense, "0");
    await assert.rejects(overview(b.workspaceId, { ...monthlyFilter, walletId: walletA.id }), /Ví không thuộc/);
    await assert.rejects(overview(b.workspaceId, { ...monthlyFilter, categoryId: categoryExpense.id }), /Danh mục không thuộc/);
    const csvInjection = await createTransaction(a, { kind: "EXPENSE", walletId: walletA.id, categoryId: categoryExpense.id,
      amount: "100", occurredAt, note: "=HYPERLINK(\"bad\")" });
    const exportCsv = await transactionsCsv(a.workspaceId, monthlyFilter);
    assert.ok(exportCsv.content.startsWith("\uFEFF"));
    assert.ok(exportCsv.content.includes("'="), "CSV formula injection must be neutralized");
    const exportedNetExpense = exportCsv.content.replace(/^\uFEFF/, "").trim().split("\r\n").slice(1)
      .reduce((s, line) => s.plus(line.split(",")[8]), new Decimal(0));
    assert.equal(exportedNetExpense.toString(), (await overview(a.workspaceId, monthlyFilter)).kpis.expense);
    const workbookBytes = await reportXlsx(a.workspaceId, monthlyFilter);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(workbookBytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    assert.deepEqual(workbook.worksheets.map(sheet => sheet.name),
      ["Tổng quan", "Thu chi", "Theo danh mục", "Giao dịch chi tiết", "Định nghĩa chỉ số"]);
    const summarySheet = workbook.getWorksheet("Tổng quan")!;
    assert.equal(summaryValue(summarySheet, "Chi phí ròng"), (await overview(a.workspaceId, monthlyFilter)).kpis.expense);
    const detailSheet = workbook.getWorksheet("Giao dịch chi tiết")!;
    assert.equal(detailSheet.rowCount - 1, exportCsv.count);
    const pdfBytes = await reportPdf(a.workspaceId, monthlyFilter);
    assert.equal(pdfBytes.subarray(0, 5).toString(), "%PDF-");
    assert.ok(pdfBytes.length > 5000);
    // G7: exports must only contain the authenticated workspace's records and KPIs.
    const categoryIncomeB = await prisma.category.findFirstOrThrow({ where: { workspaceId: b.workspaceId, name: "Lương" } });
    const categoryExpenseB = await prisma.category.findFirstOrThrow({ where: { workspaceId: b.workspaceId, name: "Ăn uống" } });
    const tenantBMarker = `tenant-b-export-${randomUUID()}`;
    const tenantBTransaction = await createTransaction(b, { kind: "INCOME", walletId: foreign.id,
      categoryId: categoryIncomeB.id, amount: "321", occurredAt, note: tenantBMarker });
    const aExportAfterB = await transactionsCsv(a.workspaceId, monthlyFilter);
    const bExport = await transactionsCsv(b.workspaceId, monthlyFilter);
    assert.ok(aExportAfterB.content.includes(expense.id));
    assert.ok(!aExportAfterB.content.includes(tenantBTransaction.id));
    assert.ok(!aExportAfterB.content.includes(tenantBMarker));
    assert.equal(bExport.count, 1);
    assert.ok(bExport.content.includes(tenantBTransaction.id));
    assert.ok(!bExport.content.includes(expense.id));
    assert.ok(!bExport.content.includes(csvInjection.id));

    const bWorkbook = new ExcelJS.Workbook();
    await bWorkbook.xlsx.load(await reportXlsx(b.workspaceId, monthlyFilter) as unknown as Parameters<typeof bWorkbook.xlsx.load>[0]);
    assert.equal(summaryValue(bWorkbook.getWorksheet("Tổng quan")!, "Thu nhập"), "321");
    assert.equal(summaryValue(bWorkbook.getWorksheet("Tổng quan")!, "Chi phí ròng"), "0");
    const bDetails = bWorkbook.getWorksheet("Giao dịch chi tiết")!;
    assert.equal(bDetails.rowCount, 2);
    assert.equal(bDetails.getCell("A2").value, tenantBTransaction.id);
    const aWorkbookAfterB = new ExcelJS.Workbook();
    await aWorkbookAfterB.xlsx.load(await reportXlsx(a.workspaceId, monthlyFilter) as unknown as Parameters<typeof aWorkbookAfterB.xlsx.load>[0]);
    assert.equal(aWorkbookAfterB.getWorksheet("Giao dịch chi tiết")!.rowCount - 1, aExportAfterB.count);
    assert.equal(summaryValue(aWorkbookAfterB.getWorksheet("Tổng quan")!, "Thu nhập"), "15000000");

    const bPdf = await reportPdf(b.workspaceId, monthlyFilter);
    assert.equal(bPdf.subarray(0, 5).toString(), "%PDF-");
    assert.ok(bPdf.length > 5000);
    const beforeDeniedExports = await Promise.all([
      prisma.journal.count({ where: { workspaceId: a.workspaceId } }),
      prisma.journal.count({ where: { workspaceId: b.workspaceId } }),
      prisma.auditLog.count({ where: { workspaceId: a.workspaceId } }),
      prisma.auditLog.count({ where: { workspaceId: b.workspaceId } }),
    ]);
    // Every read filter must fail closed before accessing another workspace's wallet/category.
    for (const readFn of [overview, expenseHeatmap, historicalTrends]) {
      await assert.rejects(readFn(b.workspaceId, { ...monthlyFilter, walletId: walletA.id }), /Ví không thuộc/);
      await assert.rejects(readFn(b.workspaceId, { ...monthlyFilter, categoryId: categoryExpense.id }), /Danh mục không thuộc/);
      await assert.rejects(readFn(a.workspaceId, { ...monthlyFilter, walletId: foreign.id }), /Ví không thuộc/);
      await assert.rejects(readFn(a.workspaceId, { ...monthlyFilter, categoryId: categoryExpenseB.id }), /Danh mục không thuộc/);
    }
    await assert.rejects(listTransactionsPage(b.workspaceId, { walletId: walletA.id }), /Ví không thuộc/);
    await assert.rejects(listTransactionsPage(b.workspaceId, { categoryId: categoryExpense.id }), /Danh mục không thuộc/);
    await assert.rejects(listTransactionsPage(a.workspaceId, { walletId: foreign.id }), /Ví không thuộc/);
    await assert.rejects(listTransactionsPage(a.workspaceId, { categoryId: categoryExpenseB.id }), /Danh mục không thuộc/);
    for (const exportFn of [transactionsCsv, reportXlsx, reportPdf]) {
      await assert.rejects(exportFn(b.workspaceId, { ...monthlyFilter, walletId: walletA.id }), /Ví không thuộc/);
      await assert.rejects(exportFn(b.workspaceId, { ...monthlyFilter, categoryId: categoryExpense.id }), /Danh mục không thuộc/);
      await assert.rejects(exportFn(a.workspaceId, { ...monthlyFilter, walletId: foreign.id }), /Ví không thuộc/);
      await assert.rejects(exportFn(a.workspaceId, { ...monthlyFilter, categoryId: categoryExpenseB.id }), /Danh mục không thuộc/);
    }
    assert.deepEqual(await Promise.all([
      prisma.journal.count({ where: { workspaceId: a.workspaceId } }),
      prisma.journal.count({ where: { workspaceId: b.workspaceId } }),
      prisma.auditLog.count({ where: { workspaceId: a.workspaceId } }),
      prisma.auditLog.count({ where: { workspaceId: b.workspaceId } }),
    ]), beforeDeniedExports, "Denied exports must not modify ledger or audit records");
    await voidTransaction(a, csvInjection.id, csvInjection.version);
    await assert.rejects(editTransaction(a, expense.id, { kind: "EXPENSE", walletId: walletA.id, categoryId: categoryExpense.id, amount: "200000", occurredAt, version: edited.version }), /Vui lòng hủy khoản hoàn tiền/);
    await assert.rejects(refundTransaction(b, expense.id, { amount: "1000" }), /Không tìm thấy khoản chi gốc/);

    const refundKey = randomUUID();
    const firstRefund = await refundTransaction(a, expense.id, { amount: "1000", note: "Test idempotency" }, refundKey);
    const secondRefund = await refundTransaction(a, expense.id, { amount: "1000", note: "Test idempotency" }, refundKey);
    assert.equal(firstRefund.id, secondRefund.id);
    await assert.rejects(refundTransaction(a, expense.id, { amount: "2000", note: "Test idempotency" }, refundKey), /Khóa hoàn tiền đã được sử dụng/);
    await voidTransaction(a, firstRefund.id, firstRefund.version);

    // G7: concurrent edits/voids of the same version must commit only one
    // reversal/replacement chain; failed attempts may not leave journals.
    const contestedEditTxn = await createTransaction(a, { kind: "EXPENSE", walletId: walletA.id,
      categoryId: categoryExpense.id, amount: "1000", occurredAt });
    const contestedEdit = { kind: "EXPENSE" as const, walletId: walletA.id,
      categoryId: categoryExpense.id, amount: "1200", occurredAt, version: contestedEditTxn.version };
    const editRace = await Promise.allSettled([
      editTransaction(a, contestedEditTxn.id, contestedEdit),
      editTransaction(a, contestedEditTxn.id, contestedEdit),
    ]);
    assert.equal(editRace.filter(x => x.status === "fulfilled").length, 1,
      "Only one edit of an obsolete version may commit");
    assert.equal(editRace.filter(x => x.status === "rejected").length, 1);
    const editedRace = await prisma.transaction.findUniqueOrThrow({ where: { id: contestedEditTxn.id } });
    assert.equal(editedRace.version, contestedEditTxn.version + 1);
    assert.equal(editedRace.amount.toFixed(0), "1200");
    assert.equal(await prisma.journal.count({ where: { transactionId: contestedEditTxn.id } }), 3);
    const voidRace = await Promise.allSettled([
      voidTransaction(a, contestedEditTxn.id, editedRace.version),
      voidTransaction(a, contestedEditTxn.id, editedRace.version),
    ]);
    assert.equal(voidRace.filter(x => x.status === "fulfilled").length, 1,
      "Only one void of a transaction may commit");
    const voidedRace = await prisma.transaction.findUniqueOrThrow({ where: { id: contestedEditTxn.id } });
    assert.equal(voidedRace.status, "VOID");
    assert.equal(voidedRace.version, contestedEditTxn.version + 2);
    assert.equal(await prisma.journal.count({ where: { transactionId: contestedEditTxn.id } }), 4);
    assert.equal(await prisma.journal.count({ where: { transactionId: contestedEditTxn.id, kind: "REVERSAL" } }), 2);

    // Sửa ngày và ví: reversal phải ở ví/ngày cũ, replacement ở ví/ngày mới.
    const oldDay = "2026-10-18T09:00:00+07:00";
    const newDay = "2026-10-19T09:00:00+07:00";
    const moving = await createTransaction(a, { kind: "EXPENSE", walletId: walletA.id, categoryId: categoryExpense.id, amount: "75000", occurredAt: oldDay });
    const moved = await editTransaction(a, moving.id, { kind: "EXPENSE", walletId: walletB.id, categoryId: categoryExpense.id, amount: "80000", occurredAt: newDay, version: moving.version });
    const oldDayReport = await overview(a.workspaceId, { start: "2026-10-18", endExclusive: "2026-10-19" });
    const newDayReport = await overview(a.workspaceId, { start: "2026-10-19", endExclusive: "2026-10-20" });
    assert.equal(oldDayReport.kpis.expense, "0");
    assert.equal(newDayReport.kpis.expense, "80000");
    assert.equal((await overview(a.workspaceId, { start: "2026-10-01", endExclusive: "2026-11-01", walletId: walletA.id })).kpis.expense, "200000");
    assert.equal((await overview(a.workspaceId, { start: "2026-10-01", endExclusive: "2026-11-01", walletId: walletB.id })).kpis.expense, "80000");
    await voidTransaction(a, moved.id, moved.version);
    assert.equal((await overview(a.workspaceId, { start: "2026-10-01", endExclusive: "2026-11-01" })).kpis.expense, "200000");

    // AT-11/12/13: tỷ lệ tiết kiệm khi không có thu, filter ví và ngày +07.
    const scoped = await overview(a.workspaceId, { start: "2026-10-01", endExclusive: "2026-11-01", walletId: walletB.id });
    assert.equal(scoped.kpis.income, "0"); assert.equal(scoped.kpis.expense, "0"); assert.equal(scoped.kpis.available, "1500000"); assert.equal(scoped.kpis.savingsRate, null);
    const anotherDay = await createTransaction(a, { kind: "EXPENSE", walletId: walletB.id, categoryId: categoryExpense.id, amount: "1", occurredAt: "2026-10-20T23:30:00+07:00" });
    const oct = await overview(a.workspaceId, { start: "2026-10-20", endExclusive: "2026-10-21" });
    assert.equal(oct.kpis.expense, "1");
    await voidTransaction(a, anotherDay.id, anotherDay.version);

    // Cursor pagination không bỏ sót/nhân đôi bản ghi và không chấp nhận cursor tenant khác.
    const pageFilters = { from: new Date("2026-09-30T17:00:00Z"), to: new Date("2026-10-31T17:00:00Z"), limit: 2 };
    const firstPage = await listTransactionsPage(a.workspaceId, pageFilters);
    assert.equal(firstPage.items.length, 2);
    assert.ok(firstPage.nextCursor);
    const secondPage = await listTransactionsPage(a.workspaceId, { ...pageFilters, cursor: firstPage.nextCursor! });
    assert.ok(secondPage.items.length > 0);
    assert.ok(secondPage.items.every(item => !firstPage.items.some(previous => previous.id === item.id)));
    await assert.rejects(listTransactionsPage(b.workspaceId, { ...pageFilters, cursor: firstPage.items[0].id }), /Trang giao dịch đã thay đổi/);

    // Hai request có chung idempotency key chỉ được ghi một giao dịch.
    const concurrentKey = randomUUID();
    const concurrentInput = { kind: "INCOME" as const, walletId: walletA.id, categoryId: categoryIncome.id, amount: "12345", occurredAt };
    const simultaneous = await Promise.allSettled([
      createTransaction(a, concurrentInput, concurrentKey),
      createTransaction(a, concurrentInput, concurrentKey),
    ]);
    assert.equal(simultaneous.filter(x => x.status === "fulfilled").length, 2, "Cùng key phải replay thành công khi chạy đồng thời");
    if (simultaneous[0].status === "fulfilled" && simultaneous[1].status === "fulfilled") {
      assert.equal(simultaneous[0].value.id, simultaneous[1].value.id);
    }
    assert.equal(await prisma.transaction.count({ where: { workspaceId: a.workspaceId, idempotencyKey: concurrentKey } }), 1);

    // Hai yêu cầu hoàn tiền riêng biệt không được hoàn tổng lớn hơn khoản chi.
    const contested = await createTransaction(a, { kind: "EXPENSE", walletId: walletA.id, categoryId: categoryExpense.id, amount: "200000", occurredAt });
    const competingRefunds = await Promise.allSettled([
      refundTransaction(a, contested.id, { amount: "150000" }, randomUUID()),
      refundTransaction(a, contested.id, { amount: "150000" }, randomUUID()),
    ]);
    assert.equal(competingRefunds.filter(x => x.status === "fulfilled").length, 1, "Không được ghi trùng hai khoản hoàn vượt số chi");
    const totalRefund = await prisma.transaction.aggregate({ where: { workspaceId: a.workspaceId, originalTransactionId: contested.id, status: "ACTIVE" }, _sum: { amount: true } });
    assert.equal(totalRefund._sum.amount?.toString(), "150000");

    // P5 savings goals: earmarking keeps every ledger posting and all financial KPIs unchanged.
    const beforeGoalReport = await overview(a.workspaceId, { start: "2026-10-01", endExclusive: "2026-11-01" });
    const journalCountBeforeGoals = await prisma.journal.count({ where: { workspaceId: a.workspaceId } });
    const postingCountBeforeGoals = await prisma.posting.count({ where: { journal: { workspaceId: a.workspaceId } } });
    const goal = await createGoal(a, { name: "Quỹ dự phòng", walletId: walletA.id, target: "1000000", dueDate: "2027-10-20" });
    await assert.rejects(createGoal(a, { name: "Ngoài phạm vi", walletId: foreign.id, target: "10000", dueDate: null }), /Ví không tồn tại/);
    await assert.rejects(updateGoal(b, goal.id, { name: "Xâm nhập" }), /Không tìm thấy mục tiêu/);
    const allocationKey = randomUUID();
    const firstAllocation = await allocateGoal(a, goal.id, { kind: "ALLOCATE", amount: "500000" }, allocationKey);
    assert.equal((await allocateGoal(a, goal.id, { kind: "ALLOCATE", amount: "500000" }, allocationKey)).id, firstAllocation.id);
    await assert.rejects(allocateGoal(a, goal.id, { kind: "ALLOCATE", amount: "100000" }, allocationKey), /Khóa đã sử dụng/);
    await assert.rejects(allocateGoal(b, goal.id, { kind: "RELEASE", amount: "1" }), /không tồn tại/);
    assert.equal((await listGoals(a.workspaceId)).find(x => x.id === goal.id)?.allocated, "500000");
    await assert.rejects(updateGoal(a, goal.id, { archived: true }), /rút toàn bộ/);
    await assert.rejects(updateGoal(a, goal.id, { walletId: walletB.id }), /rút toàn bộ/);
    await assert.rejects(allocateGoal(a, goal.id, { kind: "RELEASE", amount: "500001" }), /nhiều hơn/);
    await allocateGoal(a, goal.id, { kind: "RELEASE", amount: "200000" });
    assert.equal((await listGoals(a.workspaceId)).find(x => x.id === goal.id)?.allocated, "300000");
    const second = await createGoal(a, { name: "Mục tiêu thứ hai", walletId: walletA.id, target: "999999999", dueDate: null });
    const third = await createGoal(a, { name: "Mục tiêu thứ ba", walletId: walletA.id, target: "999999999", dueDate: null });
    const currentWallet = (await walletBalances(a.workspaceId)).find(w => w.id === walletA.id)!;
    const unallocated = new Decimal(currentWallet.balance).minus(300000);
    assert.ok(unallocated.gt(0), "Ví thử nghiệm phải có tiền chưa phân bổ");
    await assert.rejects(allocateGoal(a, second.id, { kind: "ALLOCATE", amount: currentWallet.balance }), /không đủ số dư/);
    const competing = await Promise.allSettled([
      allocateGoal(a, second.id, { kind: "ALLOCATE", amount: unallocated.toString() }, randomUUID()),
      allocateGoal(a, third.id, { kind: "ALLOCATE", amount: unallocated.toString() }, randomUUID()),
    ]);
    assert.equal(competing.filter(x => x.status === "fulfilled").length, 1, "Không thể phân bổ hai lần cùng số dư ví");
    const winningGoal = competing[0].status === "fulfilled" ? second.id : third.id;
    const winnerKey = randomUUID();
    const replayPair = await Promise.all([
      allocateGoal(a, winningGoal, { kind: "RELEASE", amount: "1000" }, winnerKey),
      allocateGoal(a, winningGoal, { kind: "RELEASE", amount: "1000" }, winnerKey),
    ]);
    assert.equal(replayPair[0].id, replayPair[1].id);
    await allocateGoal(a, winningGoal, { kind: "RELEASE", amount: unallocated.minus(1000).toString() });
    await allocateGoal(a, goal.id, { kind: "RELEASE", amount: "300000" });
    await updateGoal(a, goal.id, { archived: true });
    assert.ok(!(await listGoals(a.workspaceId)).some(g => g.id === goal.id));
    assert.ok((await listGoals(a.workspaceId, true)).some(g => g.id === goal.id && g.archived));
    await updateGoal(a, goal.id, { archived: false, walletId: walletB.id });
    assert.equal((await listGoals(a.workspaceId)).find(g => g.id === goal.id)?.walletId, walletB.id);
    const afterGoalReport = await overview(a.workspaceId, { start: "2026-10-01", endExclusive: "2026-11-01" });
    assert.deepEqual(afterGoalReport.kpis, beforeGoalReport.kpis);
    assert.equal(await prisma.journal.count({ where: { workspaceId: a.workspaceId } }), journalCountBeforeGoals);
    assert.equal(await prisma.posting.count({ where: { journal: { workspaceId: a.workspaceId } } }), postingCountBeforeGoals);

    // P5 loans/credit cards: principal is balance sheet movement, interest is P&L.
    const worthBeforeDebt = (await netWorth(a.workspaceId, "2026-10-20")).current.netWorth;
    const debtIncomeBefore = (await overview(a.workspaceId, { start: "2026-10-01", endExclusive: "2026-11-01" })).kpis.income;
    const debtExpenseBefore = (await overview(a.workspaceId, { start: "2026-10-01", endExclusive: "2026-11-01" })).kpis.expense;
    const borrowed = await createDebt(a, { direction: "BORROW", counterparty: "Ngân hàng thử nghiệm", walletId: walletB.id,
      principal: "10000000", annualRate: 12, installmentCount: 10, startDate: "2026-10-12", dueDate: "2027-08-12" });
    await assert.rejects(createDebt(a, { direction: "LEND", counterparty: "Ngoài scope", walletId: foreign.id,
      principal: "1000", annualRate: 0, startDate: "2026-10-12", dueDate: null }), /Ví không tồn tại/);
    await assert.rejects(updateDebt(b, borrowed.id, { counterparty: "Xâm nhập" }), /Không tìm thấy/);
    const debtJournalCount = await prisma.journal.count({ where: { workspaceId: a.workspaceId } });
    const debtAuditCount = await prisma.auditLog.count({ where: { workspaceId: a.workspaceId } });
    await assert.rejects(payDebt(b, borrowed.id, { walletId: foreign.id, principal: "1", interest: "0", date: "2026-10-12" }), /Không tìm thấy/);
    assert.equal(await prisma.debtPayment.count({ where: { debtId: borrowed.id } }), 0);
    assert.equal(await prisma.journal.count({ where: { workspaceId: a.workspaceId } }), debtJournalCount);
    assert.equal(await prisma.auditLog.count({ where: { workspaceId: a.workspaceId } }), debtAuditCount);
    assert.equal((await listDebts(a.workspaceId)).find(x => x.id === borrowed.id)?.remaining, "10000000");
    assert.equal((await netWorth(a.workspaceId, "2026-10-20")).current.netWorth, worthBeforeDebt);
    assert.equal((await overview(a.workspaceId, { start: "2026-10-01", endExclusive: "2026-11-01" })).kpis.income, debtIncomeBefore);
    const debtPayKey = randomUUID();
    const paid = await payDebt(a, borrowed.id, { walletId: walletB.id, principal: "2000000", interest: "100000", date: "2026-10-12" }, debtPayKey);
    assert.equal((await payDebt(a, borrowed.id, { walletId: walletB.id, principal: "2000000", interest: "100000", date: "2026-10-12" }, debtPayKey)).id, paid.id);
    await assert.rejects(payDebt(a, borrowed.id, { walletId: walletB.id, principal: "2000001", interest: "100000", date: "2026-10-12" }, debtPayKey), /Khóa đã dùng/);
    await assert.rejects(payDebt(a, borrowed.id, { walletId: walletB.id, principal: "9000000", interest: "0", date: "2026-10-12" }), /vượt dư nợ/);
    assert.equal((await listDebts(a.workspaceId)).find(x => x.id === borrowed.id)?.remaining, "8000000");
    const repayRace = await Promise.allSettled([
      payDebt(a, borrowed.id, { walletId: walletB.id, principal: "5000000", interest: "0", date: "2026-10-12" }, randomUUID()),
      payDebt(a, borrowed.id, { walletId: walletB.id, principal: "5000000", interest: "0", date: "2026-10-12" }, randomUUID()),
    ]);
    assert.equal(repayRace.filter(x => x.status === "fulfilled").length, 1, "Concurrent principal repayments cannot exceed outstanding");
    assert.equal((await listDebts(a.workspaceId)).find(x => x.id === borrowed.id)?.remaining, "3000000");
    let financialReport = await overview(a.workspaceId, { start: "2026-10-01", endExclusive: "2026-11-01" });
    assert.equal(new Decimal(financialReport.kpis.expense).minus(debtExpenseBefore).toString(), "100000");
    assert.equal(financialReport.kpis.income, debtIncomeBefore);
    assert.equal(new Decimal(worthBeforeDebt).minus((await netWorth(a.workspaceId, "2026-10-20")).current.netWorth).toString(), "100000");

    const worthAfterBorrowed = (await netWorth(a.workspaceId, "2026-10-20")).current.netWorth;
    const lent = await createDebt(a, { direction: "LEND", counterparty: "Bạn bè", walletId: walletA.id,
      principal: "2000000", annualRate: 6, installmentCount: 2, startDate: "2026-10-12", dueDate: "2027-01-12" });
    assert.equal((await netWorth(a.workspaceId, "2026-10-20")).current.receivables, "2000000");
    assert.equal((await netWorth(a.workspaceId, "2026-10-20")).current.netWorth, worthAfterBorrowed);
    await payDebt(a, lent.id, { walletId: walletA.id, principal: "1000000", interest: "50000", date: "2026-10-12" });
    assert.equal((await listDebts(a.workspaceId)).find(x => x.id === lent.id)?.remaining, "1000000");
    financialReport = await overview(a.workspaceId, { start: "2026-10-01", endExclusive: "2026-11-01" });
    assert.equal(new Decimal(financialReport.kpis.income).minus(debtIncomeBefore).toString(), "50000");
    assert.equal(financialReport.categories.reduce((sum, row) => sum.plus(row.amount), new Decimal(0)).toString(), financialReport.kpis.expense,
      "Expense breakdown includes interest postings without category");

    const credit = await createCreditCard(a, { name: "Thẻ test", lastFour: "1234", creditLimit: "5000000", openingDebt: "0", statementDay: 20, paymentDueDay: 5 });
    await assert.rejects(createCreditCard(a, { name: "Hạn mức lỗi", lastFour: null, creditLimit: "1000", openingDebt: "2000", statementDay: 20, paymentDueDay: 5 }), /vượt hạn mức/);
    await assert.rejects(updateCreditCard(b, credit.id, { name: "Xâm nhập" }), /Không tìm thấy/);
    const cardJournalCount = await prisma.journal.count({ where: { workspaceId: a.workspaceId } });
    const cardAuditCount = await prisma.auditLog.count({ where: { workspaceId: a.workspaceId } });
    await assert.rejects(createCardEntry(b, credit.id, { kind: "PURCHASE", amount: "1", categoryId: categoryExpense.id,
      date: "2026-10-12" }), /Không tìm thấy thẻ/);
    assert.equal(await prisma.cardEntry.count({ where: { cardId: credit.id } }), 0);
    assert.equal(await prisma.journal.count({ where: { workspaceId: a.workspaceId } }), cardJournalCount);
    assert.equal(await prisma.auditLog.count({ where: { workspaceId: a.workspaceId } }), cardAuditCount);
    const spendKey = randomUUID();
    const cardSpend = await createCardEntry(a, credit.id, { kind: "PURCHASE", amount: "1000000", categoryId: categoryExpense.id, date: "2026-10-12" }, spendKey);
    assert.equal((await createCardEntry(a, credit.id, { kind: "PURCHASE", amount: "1000000", categoryId: categoryExpense.id, date: "2026-10-12" }, spendKey)).id, cardSpend.id);
    await assert.rejects(createCardEntry(a, credit.id, { kind: "PURCHASE", amount: "1", categoryId: categoryExpense.id, date: "2026-10-12" }, spendKey), /Khóa đã dùng/);
    const cardBeforePay = (await overview(a.workspaceId, { start: "2026-10-01", endExclusive: "2026-11-01" })).kpis.expense;
    await createCardEntry(a, credit.id, { kind: "PAYMENT", amount: "600000", walletId: walletB.id, date: "2026-10-12" });
    assert.equal((await listCreditCards(a.workspaceId)).find(c => c.id === credit.id)?.outstanding, "400000");
    assert.equal((await overview(a.workspaceId, { start: "2026-10-01", endExclusive: "2026-11-01" })).kpis.expense, cardBeforePay);
    await assert.rejects(createCardEntry(a, credit.id, { kind: "PAYMENT", amount: "400001", walletId: walletB.id, date: "2026-10-12" }), /vượt dư nợ/);
    await createCardEntry(a, credit.id, { kind: "REFUND", amount: "100000", originalEntryId: cardSpend.id, date: "2026-10-12" });
    assert.equal((await listCreditCards(a.workspaceId)).find(c => c.id === credit.id)?.outstanding, "300000");
    assert.equal(new Decimal(cardBeforePay).minus((await overview(a.workspaceId, { start: "2026-10-01", endExclusive: "2026-11-01" })).kpis.expense).toString(), "100000");
    const payRace = await Promise.allSettled([
      createCardEntry(a, credit.id, { kind: "PAYMENT", amount: "300000", walletId: walletB.id, date: "2026-10-12" }, randomUUID()),
      createCardEntry(a, credit.id, { kind: "PAYMENT", amount: "300000", walletId: walletB.id, date: "2026-10-12" }, randomUUID()),
    ]);
    assert.equal(payRace.filter(x => x.status === "fulfilled").length, 1, "Concurrent card payments cannot overpay");
    assert.equal((await listCreditCards(a.workspaceId)).find(c => c.id === credit.id)?.outstanding, "0");
    const refundRaceCard = await createCreditCard(a, { name: "Refund race", lastFour: null, creditLimit: "2000000",
      openingDebt: "0", statementDay: 20, paymentDueDay: 5 });
    const refundRacePurchase = await createCardEntry(a, refundRaceCard.id, { kind: "PURCHASE", amount: "1000000", categoryId: categoryExpense.id, date: "2026-10-12" });
    const refundRace = await Promise.allSettled([
      createCardEntry(a, refundRaceCard.id, { kind: "REFUND", amount: "600000", originalEntryId: refundRacePurchase.id, date: "2026-10-12" }, randomUUID()),
      createCardEntry(a, refundRaceCard.id, { kind: "REFUND", amount: "600000", originalEntryId: refundRacePurchase.id, date: "2026-10-12" }, randomUUID()),
    ]);
    assert.equal(refundRace.filter(x => x.status === "fulfilled").length, 1, "Concurrent refunds cannot exceed original purchase");
    assert.equal((await listCreditCards(a.workspaceId)).find(c => c.id === refundRaceCard.id)?.outstanding, "400000");

    // Independently of the execution month, test a closed statement with
    // payments/refunds after close; purchases from the new cycle must not
    // reduce the prior statement's estimated remaining amount.
    const statement = cycleDates(localDay(new Date()), 1, 5);
    const beforeClose = localDay(new Date(vndDayStart(statement.lastStatementDate).getTime() - 86400_000));
    const afterClose = localDay(statement.start);
    const statementCard = await createCreditCard(a, { name: "Statement test", lastFour: null, creditLimit: "3000000",
      openingDebt: "0", statementDay: 1, paymentDueDay: 5 });
    const priorPurchase = await createCardEntry(a, statementCard.id, { kind: "PURCHASE", amount: "1000000", categoryId: categoryExpense.id, date: beforeClose });
    const newPurchase = await createCardEntry(a, statementCard.id, { kind: "PURCHASE", amount: "500000", categoryId: categoryExpense.id, date: afterClose });
    await createCardEntry(a, statementCard.id, { kind: "PAYMENT", amount: "200000", walletId: walletB.id, date: afterClose });
    await createCardEntry(a, statementCard.id, { kind: "REFUND", amount: "100000", originalEntryId: priorPurchase.id, date: afterClose });
    await createCardEntry(a, statementCard.id, { kind: "REFUND", amount: "50000", originalEntryId: newPurchase.id, date: afterClose });
    const statementResult = (await listCreditCards(a.workspaceId)).find(c => c.id === statementCard.id)!;
    assert.equal(statementResult.lastStatementBalance, "1000000");
    assert.equal(statementResult.estimatedStatementRemaining, "700000");
    assert.equal(statementResult.outstanding, "1150000");
    const limitRaceCard = await createCreditCard(a, { name: "Giới hạn đồng thời", lastFour: null, creditLimit: "5000000", openingDebt: "0", statementDay: 20, paymentDueDay: 5 });
    const limitRace = await Promise.allSettled([
      createCardEntry(a, limitRaceCard.id, { kind: "PURCHASE", amount: "4500000", categoryId: categoryExpense.id, date: "2026-10-12" }, randomUUID()),
      updateCreditCard(a, limitRaceCard.id, { creditLimit: "4000000" }),
    ]);
    assert.equal(limitRace.filter(x => x.status === "fulfilled").length, 1, "Concurrent limit cut and purchase must not both succeed");
    const worthFinal = await netWorth(a.workspaceId, "2026-10-20");
    assert.equal(new Decimal(worthFinal.current.assets).plus(worthFinal.current.receivables).minus(worthFinal.current.liabilities).toString(), worthFinal.current.netWorth);
    // Independently compare SQL aggregate against the posting-by-posting model.
    const worthRows = await prisma.posting.findMany({ where: {
      account: { workspaceId: a.workspaceId, kind: { in: ["ASSET", "RECEIVABLE", "LIABILITY"] } },
      journal: { workspaceId: a.workspaceId, effectiveAt: { lt: new Date(vndDayStart("2026-10-20").getTime() + 86400_000) } },
    }, select: { side: true, amount: true, account: { select: { kind: true } } } });
    const expectedWorth = worthRows.reduce((s, p) => {
      const change = normalAmount(p.account.kind, p.side, p.amount.toString());
      return s.plus(p.account.kind === "LIABILITY" ? change.negated() : change);
    }, new Decimal(0));
    assert.equal(worthFinal.current.netWorth, expectedWorth.toFixed(0));
    assert.equal(await prisma.journal.count({ where: { workspaceId: b.workspaceId, kind: { startsWith: "CARD_" } } }), 0);

    // P6: due/forecast separation, tenant isolation, concurrent idempotency and recovery.
    const testNow = new Date();
    const anchor = localDay(new Date(testNow.getTime() - 2 * 86400_000));
    const recurringInput = { name: "Khoản chi định kỳ kiểm thử", frequency: "YEARLY" as const, interval: 1,
      mode: "CONFIRM" as const, kind: "EXPENSE" as const, walletId: walletA.id, categoryId: categoryExpense.id,
      amount: "14000", note: "Recurring integration", startDate: anchor, endDate: null };
    const journalsBeforeForecast = await prisma.journal.count({ where: { workspaceId: a.workspaceId } });
    const reportBeforeForecast = await overview(a.workspaceId, { start: "2026-10-01", endExclusive: "2026-11-01" });
    const rule = await createRule(a, recurringInput);
    const ruleAuditCount = await prisma.auditLog.count({ where: { workspaceId: a.workspaceId } });
    await assert.rejects(updateRule(b, rule.id, { name: "Foreign update" }), /Không tìm thấy lịch/);
    assert.equal((await prisma.recurringRule.findUniqueOrThrow({ where: { id: rule.id } })).name, recurringInput.name);
    assert.equal(await prisma.auditLog.count({ where: { workspaceId: a.workspaceId } }), ruleAuditCount);
    await assert.rejects(createRule(a, { ...recurringInput, walletId: foreign.id }), /Ví không tồn tại/);
    await generateOccurrences(a.workspaceId, testNow);
    assert.equal((await generateOccurrences(a.workspaceId, testNow)).generated, 0, "Repeated generation must not duplicate periods");
    assert.equal(await prisma.journal.count({ where: { workspaceId: a.workspaceId } }), journalsBeforeForecast);
    assert.deepEqual((await overview(a.workspaceId, { start: "2026-10-01", endExclusive: "2026-11-01" })).kpis, reportBeforeForecast.kpis);
    const due = await prisma.recurringOccurrence.findFirstOrThrow({ where: { ruleId: rule.id, periodKey: anchor } });
    await assert.rejects(processOccurrence(b, due.id, testNow), /Không tìm thấy/);
    const pair = await Promise.allSettled([processOccurrence(a, due.id, testNow), processOccurrence(a, due.id, testNow)]);
    assert.ok(pair.some(p => p.status === "fulfilled" && p.value.status === "POSTED"));
    const posted = await processOccurrence(a, due.id, testNow);
    assert.equal(posted.status, "POSTED");
    assert.equal(await prisma.transaction.count({ where: { workspaceId: a.workspaceId, idempotencyKey: `recurring:${rule.id}:${anchor}` } }), 1);
    assert.equal(await prisma.journal.count({ where: { workspaceId: a.workspaceId } }), journalsBeforeForecast + 1);
    const futureStart = localDay(new Date(testNow.getTime() + 5 * 86400_000));
    const futureRule = await createRule(a, { ...recurringInput, name: "Future-only recurring", startDate: futureStart });
    await generateOccurrences(a.workspaceId, testNow);
    const future = await prisma.recurringOccurrence.findFirstOrThrow({ where: { ruleId: futureRule.id, periodKey: futureStart } });
    await assert.rejects(processOccurrence(a, future.id, testNow), /Chưa đến ngày/);
    // Shortening an existing rule must not leave pre-generated periods postable.
    const boundedRule = await createRule(a, { ...recurringInput, name: "End-date boundary", frequency: "DAILY", interval: 30 });
    await generateOccurrences(a.workspaceId, testNow);
    const oldForecasts = await prisma.recurringOccurrence.findMany({ where: { ruleId: boundedRule.id }, orderBy: { periodKey: "asc" } });
    assert.ok(oldForecasts.length >= 2);
    const beyondEnd = oldForecasts[1];
    const beforeShortening = await prisma.journal.count({ where: { workspaceId: a.workspaceId } });
    await updateRule(a, boundedRule.id, { endDate: anchor });
    assert.equal(await prisma.recurringOccurrence.count({ where: { ruleId: boundedRule.id } }), 1);
    assert.equal(await prisma.journal.count({ where: { workspaceId: a.workspaceId } }), beforeShortening);
    // Simulate a stale forecast from a prior software version.
    const stalePeriod = await prisma.recurringOccurrence.create({ data: {
      workspaceId: a.workspaceId, ruleId: boundedRule.id,
      periodKey: beyondEnd.periodKey, dueAt: beyondEnd.dueAt,
    } });
    await assert.rejects(processOccurrence(a, stalePeriod.id, testNow), /ngoài thời gian hiệu lực/);
    assert.equal(await prisma.journal.count({ where: { workspaceId: a.workspaceId } }), beforeShortening);
    assert.equal((await prisma.recurringOccurrence.findUniqueOrThrow({ where: { id: stalePeriod.id } })).status, "PENDING");
    await prisma.recurringOccurrence.delete({ where: { id: stalePeriod.id } });
    await updateRule(a, boundedRule.id, { endDate: null });
    await generateOccurrences(a.workspaceId, testNow);
    assert.ok(await prisma.recurringOccurrence.count({ where: { ruleId: boundedRule.id, periodKey: beyondEnd.periodKey } }));
    // G7: two generators racing with a shortening edit must serialize to a
    // schedule whose remaining unposted forecasts all respect the new end.
    const raceEnd = localDay(new Date(testNow.getTime() + 4 * 86400_000));
    const racingRule = await createRule(a, { ...recurringInput, name: "Concurrent recurrence edit",
      frequency: "DAILY", interval: 1, endDate: raceEnd });
    await Promise.all([
      generateOccurrences(a.workspaceId, testNow),
      updateRule(a, racingRule.id, { endDate: anchor }),
      generateOccurrences(a.workspaceId, testNow),
    ]);
    const racedForecasts = await prisma.recurringOccurrence.findMany({ where: { ruleId: racingRule.id } });
    assert.deepEqual(racedForecasts.map(f => f.periodKey).sort(), [anchor],
      "Concurrent shortening must remove every obsolete unposted forecast");
    assert.equal((await prisma.recurringRule.findUniqueOrThrow({ where: { id: racingRule.id } })).endDate, anchor);
    // Repeated concurrent generation must preserve uniqueness across workers.
    await updateRule(a, racingRule.id, { endDate: raceEnd });
    await Promise.all(Array.from({ length: 3 }, () => generateOccurrences(a.workspaceId, testNow)));
    const uniqueForecasts = await prisma.recurringOccurrence.findMany({ where: { ruleId: racingRule.id } });
    assert.equal(uniqueForecasts.length, new Set(uniqueForecasts.map(f => f.periodKey)).size);
    assert.equal(uniqueForecasts.length, 7, "Anchor -2 days through now +4 days, inclusive");
    // A pause concurrent with generation must prevent further new forecasts.
    await Promise.all([updateRule(a, racingRule.id, { paused: true }), generateOccurrences(a.workspaceId, testNow)]);
    const pausedCount = await prisma.recurringOccurrence.count({ where: { ruleId: racingRule.id } });
    assert.equal((await generateOccurrences(a.workspaceId, testNow)).generated, 0);
    assert.equal(await prisma.recurringOccurrence.count({ where: { ruleId: racingRule.id } }), pausedCount);
    assert.equal(await prisma.journal.count({ where: { workspaceId: a.workspaceId } }), beforeShortening,
      "Forecast generation, shortening and pausing must not post a journal");
    await updateRule(a, rule.id, { paused: true });
    assert.equal((await prisma.recurringRule.findUniqueOrThrow({ where: { id: rule.id } })).paused, true);
    await updateRule(a, rule.id, { paused: false });

    const skippedRule = await createRule(a, { ...recurringInput, name: "Skipped recurring" });
    await generateOccurrences(a.workspaceId, testNow);
    const skippedDue = await prisma.recurringOccurrence.findFirstOrThrow({ where: { ruleId: skippedRule.id, periodKey: anchor } });
    const skipAuditCount = await prisma.auditLog.count({ where: { workspaceId: a.workspaceId } });
    await assert.rejects(skipOccurrence(b, skippedDue.id), /Không tìm thấy/);
    assert.equal((await prisma.recurringOccurrence.findUniqueOrThrow({ where: { id: skippedDue.id } })).status, "PENDING");
    assert.equal(await prisma.auditLog.count({ where: { workspaceId: a.workspaceId } }), skipAuditCount);
    await skipOccurrence(a, skippedDue.id);
    await assert.rejects(skipOccurrence(a, skippedDue.id), /Chỉ bỏ qua/);
    await assert.rejects(processOccurrence(a, skippedDue.id, testNow), /được bỏ qua/);
    const autoRule = await createRule(a, { ...recurringInput, name: "Auto recurring", mode: "AUTO", amount: "12000" });
    const firstSync = await syncRecurring(a, true, testNow);
    assert.ok(firstSync.posted >= 1);
    await syncRecurring(a, true, testNow);
    assert.equal(await prisma.transaction.count({ where: { workspaceId: a.workspaceId, idempotencyKey: `recurring:${autoRule.id}:${anchor}` } }), 1);
    // A crashed worker's claim can be resumed by the next scheduled sync.
    const recoveringRule = await createRule(a, { ...recurringInput, name: "Recovery recurring", mode: "AUTO" });
    await generateOccurrences(a.workspaceId, testNow);
    const recoveringDue = await prisma.recurringOccurrence.findFirstOrThrow({ where: { ruleId: recoveringRule.id, periodKey: anchor } });
    await prisma.recurringOccurrence.update({ where: { id: recoveringDue.id }, data: { status: "PROCESSING", processingAt: new Date(testNow.getTime() - 10 * 60_000) } });
    await syncRecurring(a, true, testNow);
    assert.equal((await prisma.recurringOccurrence.findUniqueOrThrow({ where: { id: recoveringDue.id } })).status, "POSTED");

    // Failed posting rolls back the occurrence claim with no orphan ledger entry.
    const atomicRule = await createRule(a, { ...recurringInput, name: "Atomic recurring rollback" });
    await generateOccurrences(a.workspaceId, testNow);
    const atomicDue = await prisma.recurringOccurrence.findFirstOrThrow({ where: { ruleId: atomicRule.id, periodKey: anchor } });
    await prisma.recurringRule.update({ where: { id: atomicRule.id }, data: { walletId: foreign.id } });
    const beforeFailedRecurring = await prisma.journal.count({ where: { workspaceId: a.workspaceId } });
    await assert.rejects(processOccurrence(a, atomicDue.id, testNow), /Ví không tồn tại/);
    assert.equal((await prisma.recurringOccurrence.findUniqueOrThrow({ where: { id: atomicDue.id } })).status, "PENDING");
    assert.equal(await prisma.journal.count({ where: { workspaceId: a.workspaceId } }), beforeFailedRecurring);
    await prisma.recurringRule.update({ where: { id: atomicRule.id }, data: { walletId: walletA.id } });
    assert.equal((await processOccurrence(a, atomicDue.id, testNow)).status, "POSTED");
    assert.equal((await prisma.recurringOccurrence.findUniqueOrThrow({ where: { id: atomicDue.id } })).transactionId,
      (await prisma.transaction.findFirstOrThrow({ where: { workspaceId: a.workspaceId, idempotencyKey: `recurring:${atomicRule.id}:${anchor}` } })).id);

    // Reconcile a legacy post-before-link occurrence without posting twice.
    const legacyRule = await createRule(a, { ...recurringInput, name: "Legacy recurring link" });
    await generateOccurrences(a.workspaceId, testNow);
    const legacyDue = await prisma.recurringOccurrence.findFirstOrThrow({ where: { ruleId: legacyRule.id, periodKey: anchor } });
    const legacyPosted = await createTransaction(a, {
      kind: "EXPENSE", walletId: walletA.id, categoryId: categoryExpense.id,
      amount: "14000", note: "Recurring integration", occurredAt: legacyDue.dueAt.toISOString(),
    }, `recurring:${legacyRule.id}:${anchor}`);
    const beforeRelink = await prisma.journal.count({ where: { workspaceId: a.workspaceId } });
    assert.equal((await processOccurrence(a, legacyDue.id, testNow)).transactionId, legacyPosted.id);
    assert.equal(await prisma.journal.count({ where: { workspaceId: a.workspaceId } }), beforeRelink);

    // Notifications are persisted, deduplicated and scoped to a workspace.
    await reconcileNotifications(a.workspaceId, testNow);
    const notificationsFirst = await listNotifications(a.workspaceId);
    assert.ok(notificationsFirst.items.some(n => n.key.startsWith("recurring:")));
    const reminder = notificationsFirst.items.find(n => n.key.startsWith("recurring:"))!;
    await assert.rejects(markNotification(b.workspaceId, reminder.id, true), /Không tìm thấy/);
    await markNotification(a.workspaceId, reminder.id, true);
    await reconcileNotifications(a.workspaceId, testNow);
    const notificationsAgain = await listNotifications(a.workspaceId);
    assert.equal(notificationsAgain.items.length, notificationsFirst.items.length, "Reconciliation must deduplicate");
    assert.ok(notificationsAgain.items.find(n => n.id === reminder.id)?.readAt, "Read state must persist");

    // CSV staging never posts ledger entries. Repeated imports replay a stable transaction key.
    const csv = ["date,amount,kind,note", "2026-10-12,5600,CHI,CSV test", "2026-10-12,5600,CHI,CSV test",
      "2026-10-12,7800,CHI,=DANGEROUS", "2026-10-12,0,CHI,invalid amount"].join("\n");
    const csvOptions = { dateColumn: "date", amountColumn: "amount", kindColumn: "kind", noteColumn: "note",
      defaultKind: "EXPENSE" as const, walletId: walletA.id, expenseCategoryId: categoryExpense.id };
    const beforeImport = await prisma.journal.count({ where: { workspaceId: a.workspaceId } });
    const preview = await previewImport(a, new File([csv], "transactions.csv", { type: "text/csv" }), csvOptions);
    assert.equal(preview.counts.VALID, 1);
    assert.equal(preview.counts.DUPLICATE, 1);
    assert.equal(preview.counts.INVALID, 2);
    assert.equal(await prisma.journal.count({ where: { workspaceId: a.workspaceId } }), beforeImport);
    const beforeForeignImport = {
      journalsA: await prisma.journal.count({ where: { workspaceId: a.workspaceId } }),
      journalsB: await prisma.journal.count({ where: { workspaceId: b.workspaceId } }),
      batch: await prisma.importBatch.findUniqueOrThrow({ where: { id: preview.id } }),
      rows: await prisma.importRow.findMany({ where: { workspaceId: a.workspaceId, batchId: preview.id },
        select: { id: true, status: true, transactionId: true }, orderBy: { id: "asc" } }),
    };
    await assert.rejects(getImport(b.workspaceId, preview.id), /Không tìm thấy/);
    await assert.rejects(commitImport(b, preview.id), /Không tìm thấy/);
    await assert.rejects(retryFailedImport(b, preview.id), /Không tìm thấy/);
    assert.equal(await prisma.journal.count({ where: { workspaceId: a.workspaceId } }), beforeForeignImport.journalsA);
    assert.equal(await prisma.journal.count({ where: { workspaceId: b.workspaceId } }), beforeForeignImport.journalsB);
    assert.deepEqual(await prisma.importBatch.findUniqueOrThrow({ where: { id: preview.id } }), beforeForeignImport.batch);
    assert.deepEqual(await prisma.importRow.findMany({ where: { workspaceId: a.workspaceId, batchId: preview.id },
      select: { id: true, status: true, transactionId: true }, orderBy: { id: "asc" } }), beforeForeignImport.rows);
    const commitPair = await Promise.all([commitImport(a, preview.id), commitImport(a, preview.id)]);
    assert.equal(commitPair.reduce((sum, c) => sum + c.imported, 0), 1);
    assert.equal(await prisma.journal.count({ where: { workspaceId: a.workspaceId } }), beforeImport + 1);
    assert.equal((await commitImport(a, preview.id)).remaining, 0);
    const repreview = await previewImport(a, new File([csv], "transactions.csv", { type: "text/csv" }), csvOptions);
    assert.equal(repreview.counts.DUPLICATE, 2, "Across-batch duplicates must be detected before commit");
    assert.equal(repreview.counts.VALID ?? 0, 0);

    // Both batches were previewed before either committed: the unique transaction key
    // and serializable retry must leave one posted transaction and one duplicate row.
    const raceCsv = "date,amount,kind,note\n2026-10-09,6800,CHI,Across batch concurrent";
    const raceA = await previewImport(a, new File([raceCsv], "race-a.csv"), csvOptions);
    const raceB = await previewImport(a, new File([raceCsv], "race-b.csv"), csvOptions);
    assert.equal(raceA.counts.VALID, 1);
    assert.equal(raceB.counts.VALID, 1);
    const beforeRace = await prisma.journal.count({ where: { workspaceId: a.workspaceId } });
    const raced = await Promise.all([commitImport(a, raceA.id), commitImport(a, raceB.id)]);
    assert.equal(raced.reduce((sum, item) => sum + item.imported, 0), 1);
    const statusA = await getImport(a.workspaceId, raceA.id);
    const statusB = await getImport(a.workspaceId, raceB.id);
    assert.equal((statusA.counts.IMPORTED ?? 0) + (statusB.counts.IMPORTED ?? 0), 1);
    assert.equal((statusA.counts.DUPLICATE ?? 0) + (statusB.counts.DUPLICATE ?? 0), 1);
    assert.equal(await prisma.journal.count({ where: { workspaceId: a.workspaceId } }), beforeRace + 1);

    // Simulate a crash after a balanced journal is created but before the import
    // transaction commits: every write, including the journal, must roll back.
    const atomicCsv = "date,amount,kind,note\n2026-10-07,7600,CHI,Atomic journal rollback";
    const atomicImport = await previewImport(a, new File([atomicCsv], "atomic.csv"), csvOptions);
    const atomicRow = await prisma.importRow.findFirstOrThrow({ where: { batchId: atomicImport.id, status: "VALID" } });
    const beforeAbort = await prisma.journal.count({ where: { workspaceId: a.workspaceId } });
    const atomicKey = `import:${atomicRow.sourceHash}`;
    await assert.rejects(serializable(async db => {
      await db.importRow.update({ where: { id: atomicRow.id }, data: { error: null } });
      const postedInside = await createTransactionInDb(db, a, {
        kind: "EXPENSE", walletId: walletA.id, categoryId: categoryExpense.id,
        amount: "7600", occurredAt: atomicRow.occurredAt!.toISOString(), note: atomicRow.note ?? undefined,
      }, atomicKey);
      await db.importRow.update({ where: { id: atomicRow.id }, data: { status: "IMPORTED", transactionId: postedInside.id } });
      throw new Error("Test-only simulated abort after ledger posting");
    }), /simulated abort/);
    assert.equal(await prisma.journal.count({ where: { workspaceId: a.workspaceId } }), beforeAbort);
    assert.equal(await prisma.transaction.count({ where: { workspaceId: a.workspaceId, idempotencyKey: atomicKey } }), 0);
    assert.equal((await prisma.importRow.findUniqueOrThrow({ where: { id: atomicRow.id } })).status, "VALID");
    assert.equal((await commitImport(a, atomicImport.id)).imported, 1);
    assert.equal(await prisma.journal.count({ where: { workspaceId: a.workspaceId } }), beforeAbort + 1);

    // Reconcile an old import transaction posted before its staging row was linked.
    const legacyCsv = "date,amount,kind,note\n2026-10-06,7900,CHI,Legacy import relink";
    const legacyPreview = await previewImport(a, new File([legacyCsv], "legacy.csv"), csvOptions);
    const legacyRow = await prisma.importRow.findFirstOrThrow({ where: { batchId: legacyPreview.id, status: "VALID" } });
    const legacyTransaction = await createTransaction(a, {
      kind: "EXPENSE", walletId: walletA.id, categoryId: categoryExpense.id,
      amount: "7900", occurredAt: legacyRow.occurredAt!.toISOString(), note: legacyRow.note ?? undefined,
    }, `import:${legacyRow.sourceHash}`);
    const beforeLegacyCommit = await prisma.journal.count({ where: { workspaceId: a.workspaceId } });
    assert.equal((await commitImport(a, legacyPreview.id)).imported, 1);
    assert.equal((await prisma.importRow.findUniqueOrThrow({ where: { id: legacyRow.id } })).transactionId, legacyTransaction.id);
    assert.equal(await prisma.journal.count({ where: { workspaceId: a.workspaceId } }), beforeLegacyCommit);

    // Bad financial inputs must not leave ledger artifacts; retry after correction.
    const rollbackCsv = "date,amount,kind,note\n2026-10-08,7300,CHI,Failed import then retry";
    const rollbackPreview = await previewImport(a, new File([rollbackCsv], "rollback.csv"), csvOptions);
    await prisma.importRow.updateMany({ where: { batchId: rollbackPreview.id, workspaceId: a.workspaceId }, data: { walletId: foreign.id } });
    const beforeRollback = await prisma.journal.count({ where: { workspaceId: a.workspaceId } });
    assert.equal((await commitImport(a, rollbackPreview.id)).failed, 1);
    assert.equal((await getImport(a.workspaceId, rollbackPreview.id)).counts.FAILED, 1);
    assert.equal(await prisma.journal.count({ where: { workspaceId: a.workspaceId } }), beforeRollback);
    await prisma.importRow.updateMany({ where: { batchId: rollbackPreview.id, workspaceId: a.workspaceId }, data: { walletId: walletA.id } });
    await retryFailedImport(a, rollbackPreview.id);
    assert.equal((await commitImport(a, rollbackPreview.id)).imported, 1);
    assert.equal(await prisma.journal.count({ where: { workspaceId: a.workspaceId } }), beforeRollback + 1);

    // Simulate a transient failure in a test-only staging row, then recover it.
    const retryCsv = "date,amount,kind,note\n2026-10-11,9400,CHI,CSV retry test";
    const retryPreview = await previewImport(a, new File([retryCsv], "retry.csv", { type: "text/csv" }), csvOptions);
    await prisma.importRow.updateMany({
      where: { workspaceId: a.workspaceId, batchId: retryPreview.id, status: "VALID" },
      data: { status: "FAILED", error: "Test-only simulated interruption" },
    });
    await assert.rejects(retryFailedImport(b, retryPreview.id), /Không tìm thấy/);
    assert.equal((await retryFailedImport(a, retryPreview.id)).retried, 1);
    assert.equal((await retryFailedImport(a, retryPreview.id)).retried, 0, "Retry must only requeue FAILED rows");
    assert.equal((await commitImport(a, retryPreview.id)).imported, 1);
    assert.equal((await commitImport(a, retryPreview.id)).imported, 0);

    // XLSX uses the same staging, tenant isolation, idempotency and double-entry posting.
    const importWorkbook = new ExcelJS.Workbook();
    const importSheet = importWorkbook.addWorksheet("Giao dịch");
    importSheet.addRow(["date", "amount", "kind", "note"]);
    importSheet.addRow([new Date("2026-10-10T00:00:00Z"), 11300, "CHI", "XLSX test"]);
    const importBuffer = Buffer.from(await importWorkbook.xlsx.writeBuffer());
    const xlsxPreview = await previewImport(a, new File([importBuffer], "transactions.xlsx"), csvOptions);
    assert.equal(xlsxPreview.counts.VALID, 1);
    await assert.rejects(commitImport(b, xlsxPreview.id), /Không tìm thấy/);
    assert.equal((await commitImport(a, xlsxPreview.id)).imported, 1);
    assert.equal((await commitImport(a, xlsxPreview.id)).imported, 0);
    const xlsxDuplicate = await previewImport(a, new File([importBuffer], "transactions.xlsx"), csvOptions);
    assert.equal(xlsxDuplicate.counts.DUPLICATE, 1);

    // T02.11: real PostgreSQL wallet reconciliation, equity-only adjustment,
    // repeat key, stale snapshot, tenant isolation and no-op audit.
    const reconWallet = await createWallet(a, { name: "Ví kiểm kê", type: "CASH", openingBalance: "200000", openingDate: occurredAt });
    const reportBeforeRecon = await overview(a.workspaceId, monthlyFilter);
    const key1 = randomUUID();
    const decrease = await reconcileWallet(a, reconWallet.id, {
      expectedBalance: "200000", actualBalance: "150000", reason: "Kiểm kê phát hiện thiếu", idempotencyKey: key1,
    });
    assert.equal(decrease.delta, "-50000");
    assert.equal((await walletBalances(a.workspaceId)).find(w => w.id === reconWallet.id)?.balance, "150000");
    assert.equal((await reconcileWallet(a, reconWallet.id, { expectedBalance: "200000", actualBalance: "150000", reason: "Kiểm kê phát hiện thiếu", idempotencyKey: key1 })).id, decrease.id);
    await assert.rejects(reconcileWallet(a, reconWallet.id, { expectedBalance: "200000", actualBalance: "140000", reason: "Kiểm kê phát hiện thiếu", idempotencyKey: key1 }), /Khóa đối soát/);
    await assert.rejects(reconcileWallet(a, reconWallet.id, { expectedBalance: "200000", actualBalance: "180000", reason: "Số dư đã cũ", idempotencyKey: randomUUID() }), /Số dư ví đã thay đổi/);
    await assert.rejects(reconcileWallet(b, reconWallet.id, { expectedBalance: "150000", actualBalance: "180000", reason: "Không thuộc workspace", idempotencyKey: randomUUID() }), /Không tìm thấy ví/);
    const increase = await reconcileWallet(a, reconWallet.id, { expectedBalance: "150000", actualBalance: "180000", reason: "Kiểm đếm lại tiền", idempotencyKey: randomUUID() });
    assert.equal(increase.delta, "30000");
    const noChange = await reconcileWallet(a, reconWallet.id, { expectedBalance: "180000", actualBalance: "180000", reason: "Kiểm kê khớp sổ", idempotencyKey: randomUUID() });
    assert.equal(noChange.journalId, null);
    assert.equal((await listWalletReconciliations(a.workspaceId, reconWallet.id)).length, 3);
    await assert.rejects(listWalletReconciliations(b.workspaceId, reconWallet.id), /Không tìm thấy ví/);
    const reportAfterRecon = await overview(a.workspaceId, monthlyFilter);
    assert.equal(reportAfterRecon.kpis.income, reportBeforeRecon.kpis.income);
    assert.equal(reportAfterRecon.kpis.expense, reportBeforeRecon.kpis.expense);
    assert.equal((await walletBalances(a.workspaceId)).find(w => w.id === reconWallet.id)?.balance, "180000");

    // Đối soát double-entry từng journal, kể cả reversal.
    const journals = await prisma.journal.findMany({ where: { workspaceId: a.workspaceId }, include: { postings: true } });
    for (const journal of journals) validateBalanced(journal.postings.map(x => ({ ledgerAccountId: x.ledgerAccountId, side: x.side, amount: new Decimal(x.amount.toString()) })));
    // G7 SQL aggregate regression: compare with each original posting after
    // edits/reversals, refunds, imports, interest, card entries and tenant B data.
    for (const filter of [
      monthlyFilter,
      { ...monthlyFilter, walletId: walletA.id },
      { ...monthlyFilter, walletId: walletB.id },
      { ...monthlyFilter, categoryId: categoryExpense.id },
      { ...monthlyFilter, categoryId: categoryIncome.id },
      { ...monthlyFilter, walletId: walletA.id, categoryId: categoryExpense.id },
      { start: "2026-10-20", endExclusive: "2026-10-21" },
      { start: "2026-09-01", endExclusive: "2026-10-01" },
    ]) await assertOverviewMatchesLedger(a.workspaceId, filter);
    await assert.rejects(overview(a.workspaceId, { start: "2026-11-01", endExclusive: "2026-12-01" }), /Kỳ báo cáo chưa bắt đầu/);
    await assertOverviewMatchesLedger(b.workspaceId, monthlyFilter);
    await assertOverviewMatchesLedger(b.workspaceId, { ...monthlyFilter, walletId: foreign.id });
    await assertOverviewMatchesLedger(b.workspaceId, { ...monthlyFilter, categoryId: categoryExpenseB.id });
    // Test the full reconciliation SQL against real edit/reversal/import/recurring data.
    const cleanAudit = await auditLedger(prisma, a.workspaceId);
    for (const [name, rows] of Object.entries(cleanAudit.findings)) {
      assert.equal(rows.length, 0, `Unexpected ${name} on a valid integration workspace`);
    }

    // Intentionally corrupt data only inside transactions that are always rolled back.
    // Deferred journal triggers permit inspecting the corrupt intermediate state.
    const reversal = journals.find(j => j.kind === "REVERSAL" && j.postings.length > 0);
    assert.ok(reversal, "Integration data must include a reversal");
    await assert.rejects(prisma.$transaction(async db => {
      await db.posting.update({ where: { id: reversal.postings[0].id }, data: { amount: { increment: 1 } } });
      const probe = await auditLedger(db, a.workspaceId);
      assert.ok(probe.findings.REVERSAL_MISMATCH.some(item => item.id === reversal.id), "Corrupt reversal went undetected");
      assert.ok(probe.findings.UNBALANCED_JOURNAL.some(item => item.id === reversal.id), "Unbalanced journal went undetected");
      throw new Error("rollback-reversal-probe");
    }), /rollback-reversal-probe/);

    await assert.rejects(prisma.$transaction(async db => {
      await db.transaction.update({ where: { id: transfer.id }, data: { status: "VOID" } });
      const probe = await auditLedger(db, a.workspaceId);
      assert.ok(probe.findings.VOID_JOURNAL_ACTIVE.some(item => item.id === transfer.id), "Void transaction with active journal went undetected");
      throw new Error("rollback-void-probe");
    }), /rollback-void-probe/);

    const imported = await prisma.importRow.findFirstOrThrow({ where: { workspaceId: a.workspaceId, status: "IMPORTED" } });
    await assert.rejects(prisma.$transaction(async db => {
      await db.importRow.update({ where: { id: imported.id }, data: { status: "VALID" } });
      const probe = await auditLedger(db, a.workspaceId);
      assert.ok(probe.findings.IMPORT_LINK.some(item => item.id === imported.id), "Corrupt import link went undetected");
      throw new Error("rollback-import-probe");
    }), /rollback-import-probe/);
    const transferJournal = journals.find(j => j.transactionId === transfer.id && j.kind === "POSTED")!;
    assert.ok(transferJournal);
    await assert.rejects(prisma.$transaction(async db => {
      await db.journal.update({ where: { id: transferJournal.id }, data: { transactionId: null } });
      const probe = await auditLedger(db, a.workspaceId);
      assert.ok(probe.findings.JOURNAL_LINK.some(item => item.id === transferJournal.id), "Detached journal went undetected");
      assert.ok(probe.findings.TRANSACTION_JOURNAL_MISSING.some(item => item.id === transfer.id), "Orphan transaction went undetected");
      throw new Error("rollback-journal-link-probe");
    }), /rollback-journal-link-probe/);
    await assert.rejects(prisma.$transaction(async db => {
      await db.posting.update({ where: { id: transferJournal.postings[0].id }, data: { ledgerAccountId: foreign.ledgerAccountId } });
      const probe = await auditLedger(db, a.workspaceId);
      assert.ok(probe.findings.FOREIGN_POSTING.some(item => item.id === transferJournal.postings[0].id), "Foreign account posting went undetected");
      throw new Error("rollback-foreign-posting-probe");
    }), /rollback-foreign-posting-probe/);
    await assert.rejects(prisma.$transaction(async db => {
      await db.recurringOccurrence.update({ where: { id: due.id }, data: { transactionId: transfer.id } });
      const probe = await auditLedger(db, a.workspaceId);
      assert.ok(probe.findings.RECURRING_LINK.some(item => item.id === due.id), "Wrong recurring transaction went undetected");
      throw new Error("rollback-recurring-link-probe");
    }), /rollback-recurring-link-probe/);
    await assert.rejects(prisma.$transaction(async db => {
      await db.importRow.update({ where: { id: imported.id }, data: { transactionId: transfer.id } });
      const probe = await auditLedger(db, a.workspaceId);
      assert.ok(probe.findings.IMPORT_LINK.some(item => item.id === imported.id), "Wrong import transaction went undetected");
      throw new Error("rollback-import-idempotency-probe");
    }), /rollback-import-idempotency-probe/);
    await assert.rejects(prisma.$transaction(async db => {
      await db.ledgerAccount.update({ where: { id: walletA.ledgerAccountId }, data: { kind: "LIABILITY" } });
      const probe = await auditLedger(db, a.workspaceId);
      assert.ok(probe.findings.WALLET_ACCOUNT.some(item => item.id === walletA.id), "Wallet/account kind mismatch went undetected");
      throw new Error("rollback-wallet-account-probe");
    }), /rollback-wallet-account-probe/);
    assert.equal((await auditLedger(prisma, a.workspaceId)).findings.REVERSAL_MISMATCH.length, 0, "Rollback must preserve ledger data");
    console.log(`PASS: P2–P6 integration (recurring, CSV/XLSX staging/commit/retry, notification isolation/dedup, concurrency, accounting); ${journals.length} journals balanced.`);
  } finally {
    for (const workspaceId of createdWorkspaces) {
      await prisma.walletReconciliation.deleteMany({ where: { workspaceId } });
      await prisma.notification.deleteMany({ where: { workspaceId } });
      await prisma.recurringOccurrence.deleteMany({ where: { workspaceId } });
      await prisma.recurringRule.deleteMany({ where: { workspaceId } });
      await prisma.importRow.deleteMany({ where: { workspaceId } });
      await prisma.importBatch.deleteMany({ where: { workspaceId } });
      await prisma.cardEntry.deleteMany({ where: { workspaceId, kind: "REFUND" } });
      await prisma.cardEntry.deleteMany({ where: { workspaceId } });
      await prisma.creditCard.deleteMany({ where: { workspaceId } });
      await prisma.debtPayment.deleteMany({ where: { workspaceId } });
      await prisma.debtContract.deleteMany({ where: { workspaceId } });
      // The deferred journal invariant is evaluated at COMMIT, so remove
      // postings and their journals atomically in this test-only workspace.
      await prisma.$transaction(async db => {
        await db.posting.deleteMany({ where: { journal: { workspaceId } } });
        await db.journal.deleteMany({ where: { workspaceId } });
      });
      await prisma.transaction.deleteMany({ where: { workspaceId } });
      await prisma.goalAllocation.deleteMany({ where: { workspaceId } });
      await prisma.savingsGoal.deleteMany({ where: { workspaceId } });
      await prisma.budget.deleteMany({ where: { workspaceId } });
      await prisma.wallet.deleteMany({ where: { workspaceId } });
      await prisma.category.deleteMany({ where: { workspaceId } });
      await prisma.ledgerAccount.deleteMany({ where: { workspaceId } });
      await prisma.membership.deleteMany({ where: { workspaceId } });
      await prisma.auditLog.deleteMany({ where: { workspaceId } });
      await prisma.workspace.delete({ where: { id: workspaceId } });
    }
    try {
      if (createdUsers.length) await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
    } finally {
      await prisma.$disconnect();
    }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
