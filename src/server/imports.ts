import { createHash } from "node:crypto";
import { Prisma, TransactionKind } from "@finova/prisma";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { csvDay, safeCsvText } from "@/lib/csv-import";
import { parseImportFile } from "@/lib/import-files";
import { localDay, vndDayStart } from "@/lib/dates";
import { parseVnd } from "@/lib/money";
import { HttpError, type UserContext } from "@/server/context";
import { createTransactionInDb } from "@/server/ledger";
import { serializable } from "@/server/serializable";
import { requireWorkspacePremiumInDb } from "@/server/premium";

const previewOptions = z.object({
  dateColumn: z.string().min(1).max(100),
  amountColumn: z.string().min(1).max(100),
  kindColumn: z.string().max(100).optional(),
  noteColumn: z.string().max(100).optional(),
  defaultKind: z.enum(["INCOME", "EXPENSE", "TRANSFER"]),
  walletId: z.string().min(1),
  incomeCategoryId: z.string().optional(),
  expenseCategoryId: z.string().optional(),
  destinationWalletId: z.string().optional(),
}).strict();
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

function parseKind(raw: string): "INCOME" | "EXPENSE" | "TRANSFER" {
  const value = raw.trim().toUpperCase();
  if (["INCOME", "THU", "RECEIPT"].includes(value)) return "INCOME";
  if (["EXPENSE", "CHI", "PAYMENT"].includes(value)) return "EXPENSE";
  if (["TRANSFER", "CHUYỂN", "CHUYEN"].includes(value)) return "TRANSFER";
  throw new Error("Loại giao dịch phải là INCOME, EXPENSE hoặc TRANSFER.");
}

export async function previewImport(context: UserContext, file: File, raw: unknown) {
  const options = previewOptions.parse(raw);
  let rows: string[][];
  let fileHash: string;
  try { ({ rows, fileHash } = await parseImportFile(file)); }
  catch (error) { throw new HttpError(400, "IMPORT_INVALID", error instanceof Error ? error.message : "Tệp không hợp lệ."); }
  const columns = rows[0].map(c => c.trim());
  if (new Set(columns).size !== columns.length) throw new HttpError(400, "CSV_HEADERS", "Tiêu đề cột CSV không được trùng.");
  const index = (col?: string) => col ? columns.indexOf(col) : -1;
  if ([options.dateColumn, options.amountColumn, ...(options.kindColumn ? [options.kindColumn] : []), ...(options.noteColumn ? [options.noteColumn] : [])].some(c => index(c) < 0)) {
    throw new HttpError(400, "CSV_MAPPING", "Không tìm thấy cột được ánh xạ trong CSV.");
  }
  const wallets = await prisma.wallet.findMany({ where: { workspaceId: context.workspaceId, archivedAt: null }, select: { id: true } });
  const categories = await prisma.category.findMany({ where: { workspaceId: context.workspaceId, archivedAt: null }, select: { id: true, kind: true } });
  if (!wallets.some(w => w.id === options.walletId)) throw new HttpError(422, "INVALID_WALLET", "Ví không hợp lệ.");
  const category = (kind: "INCOME" | "EXPENSE") => {
    const id = kind === "INCOME" ? options.incomeCategoryId : options.expenseCategoryId;
    if (!categories.some(c => c.id === id && c.kind === kind)) throw new Error(`Chưa chọn danh mục ${kind === "INCOME" ? "thu" : "chi"} phù hợp.`);
    return id!;
  };
  const today = localDay(new Date());
  const seen = new Set<string>();
  const prepared: Prisma.ImportRowCreateManyInput[] = rows.slice(1).map((values, indexRow) => {
    let kind: "INCOME" | "EXPENSE" | "TRANSFER" | undefined;
    let amount: string | undefined, occurredAt: Date | undefined, note: string | undefined, cat: string | undefined, dest: string | undefined;
    let error: string | undefined;
    let sourceHash = hash(`${context.workspaceId}:${indexRow}:${values.join("\0")}`);
    try {
      kind = options.kindColumn ? parseKind(values[index(options.kindColumn)]) : options.defaultKind;
      amount = parseVnd(values[index(options.amountColumn)].trim()).toFixed(0);
      const day = csvDay(values[index(options.dateColumn)]);
      if (day > today) throw new Error("Không thể nhập giao dịch tương lai.");
      occurredAt = vndDayStart(day);
      note = options.noteColumn ? safeCsvText(values[index(options.noteColumn)]) : "";
      if (note.length > 1000) throw new Error("Ghi chú vượt 1.000 ký tự.");
      if (kind === "TRANSFER") {
        dest = options.destinationWalletId;
        if (!dest || dest === options.walletId || !wallets.some(w => w.id === dest)) throw new Error("Thiếu ví nhận cho chuyển khoản.");
      } else cat = category(kind);
      sourceHash = hash(JSON.stringify([kind, options.walletId, dest || "", cat || "", amount, day, note]));
    } catch (e) { error = e instanceof Error ? e.message : "Dòng không hợp lệ."; }
    let status: "VALID" | "INVALID" | "DUPLICATE" = error ? "INVALID" : "VALID";
    if (!error && seen.has(sourceHash)) { status = "DUPLICATE"; error = "Dòng trùng nội dung trong tệp."; }
    if (!error) seen.add(sourceHash);
    return { id: crypto.randomUUID(), workspaceId: context.workspaceId, batchId: "", rowNumber: indexRow + 2, sourceHash,
      kind: kind as TransactionKind | undefined, walletId: options.walletId, categoryId: cat, destinationWalletId: dest,
      amount, occurredAt, note, status, error };
  });
  const existing = await prisma.importRow.findMany({ where: { workspaceId: context.workspaceId, status: "IMPORTED", sourceHash: { in: prepared.filter(r => r.status === "VALID").map(r => r.sourceHash) } }, select: { sourceHash: true } });
  const prior = new Set(existing.map(r => r.sourceHash));
  for (const row of prepared) if (row.status === "VALID" && prior.has(row.sourceHash)) { row.status = "DUPLICATE"; row.error = "Đã được nhập trong một đợt trước."; }
  const batch = await prisma.$transaction(async tx => {
    await requireWorkspacePremiumInDb(tx, context.workspaceId, "STATEMENT_IMPORT");
    const batch = await tx.importBatch.create({ data: { workspaceId: context.workspaceId, createdById: context.userId, fileName: file.name.slice(0, 200), fileHash } });
    for (let i = 0; i < prepared.length; i += 500) await tx.importRow.createMany({ data: prepared.slice(i, i + 500).map(row => ({ ...row, batchId: batch.id })) });
    return batch;
  });
  return await getImport(context.workspaceId, batch.id);
}

export async function getImport(workspaceId: string, id: string) {
  const batch = await prisma.importBatch.findFirst({ where: { id, workspaceId } });
  if (!batch) throw new HttpError(404, "NOT_FOUND", "Không tìm thấy đợt nhập.");
  const [groups, rows] = await Promise.all([
    prisma.importRow.groupBy({ by: ["status"], where: { batchId: id, workspaceId }, _count: { _all: true } }),
    prisma.importRow.findMany({ where: { batchId: id, workspaceId }, orderBy: { rowNumber: "asc" }, take: 200 }),
  ]);
  const counts = Object.fromEntries(groups.map(g => [g.status, g._count._all]));
  return { id: batch.id, fileName: batch.fileName, status: batch.status, counts, total: groups.reduce((s, g) => s + g._count._all, 0),
    rows: rows.map(row => ({ id: row.id, rowNumber: row.rowNumber, kind: row.kind, amount: row.amount?.toFixed(0), date: row.occurredAt ? localDay(row.occurredAt) : null, note: row.note, status: row.status, error: row.error,
      categoryId: row.categoryId, destinationWalletId: row.destinationWalletId, walletId: row.walletId, confidence: row.confidence, categoryReason: row.categoryReason, needsReview: row.needsReview, sourceReference: row.sourceReference })) };
}

/** Remove only staging data. The same row lock as commit prevents deleting a posted row. */
export async function deleteImportRow(context: UserContext, batchId: string, rowId: string) {
  return serializable(async tx => {
    await requireWorkspacePremiumInDb(tx, context.workspaceId, "STATEMENT_IMPORT");
    const removed = await tx.importRow.deleteMany({
      where: { id: rowId, batchId, workspaceId: context.workspaceId, transactionId: null,
        status: { in: ["VALID", "INVALID", "FAILED", "DUPLICATE"] } },
    });
    if (!removed.count) throw new HttpError(409, "ROW_NOT_DELETABLE", "Dòng đã nhập hoặc không còn tồn tại. Hãy tải lại đợt nhập.");
    const pending = await tx.importRow.count({ where: { batchId, workspaceId: context.workspaceId, status: { in: ["VALID", "INVALID", "FAILED"] } } });
    await tx.importBatch.update({ where: { id: batchId, workspaceId: context.workspaceId }, data: { status: pending ? "PREVIEW" : "COMPLETE" } });
    return { deleted: true };
  });
}

export async function commitImport(context: UserContext, id: string) {
  const batch = await prisma.importBatch.findFirst({ where: { id, workspaceId: context.workspaceId } });
  if (!batch) throw new HttpError(404, "NOT_FOUND", "Không tìm thấy đợt nhập.");
  const rows = await prisma.importRow.findMany({ where: { batchId: id, workspaceId: context.workspaceId, status: "VALID" }, orderBy: { rowNumber: "asc" }, take: 50 });
  let imported = 0, failed = 0;
  for (const row of rows) {
    try {
      const result = await serializable(async db => {
        await requireWorkspacePremiumInDb(db, context.workspaceId, "STATEMENT_IMPORT");
        // Lock the staging row inside the same transaction that writes the journal.
        const claimed = await db.importRow.updateMany({
          where: { id: row.id, batchId: id, workspaceId: context.workspaceId, status: "VALID" },
          data: { error: null },
        });
        if (!claimed.count) return "SKIPPED";
        const current = await db.importRow.findUniqueOrThrow({ where: { id: row.id, workspaceId: context.workspaceId } });
        if (current.needsReview || !current.kind || !current.walletId || !current.amount || !current.occurredAt) throw new Error("Dữ liệu nhập chưa được xác nhận đầy đủ.");
        const key = `import:${current.sourceHash}`;
        const existing = await db.transaction.findFirst({ where: { workspaceId: context.workspaceId, idempotencyKey: key } });
        // Reconcile legacy post-before-link rows, but mark subsequent batches as duplicates.
        const importedElsewhere = existing && await db.importRow.count({
          where: { workspaceId: context.workspaceId, sourceHash: current.sourceHash, status: "IMPORTED", id: { not: current.id } },
        });
        if (importedElsewhere) {
          await db.importRow.update({ where: { id: current.id, workspaceId: context.workspaceId }, data: { status: "DUPLICATE", error: "Giao dịch đã được nhập trong một đợt khác." } });
          return "DUPLICATE";
        }
        const transaction = await createTransactionInDb(db, context, {
          kind: current.kind as "INCOME" | "EXPENSE" | "TRANSFER", walletId: current.walletId,
          categoryId: current.categoryId ?? undefined, destinationWalletId: current.destinationWalletId ?? undefined,
          amount: current.amount.toFixed(0), occurredAt: current.occurredAt.toISOString(), note: current.note ?? undefined,
        }, key);
        await db.importRow.update({ where: { id: current.id, workspaceId: context.workspaceId }, data: { status: "IMPORTED", transactionId: transaction.id, error: null } });
        return "IMPORTED";
      });
      if (result === "IMPORTED") imported++;
    } catch (error) {
      // An expired or suspended account must not turn a staged VALID row into FAILED.
      if (error instanceof HttpError && ["PREMIUM_REQUIRED", "ACCOUNT_DISABLED"].includes(error.code)) throw error;
      // Serialization/unique-key races may be retried by the next request; preserve VALID.
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code)) throw error;
      await prisma.importRow.updateMany({ where: { id: row.id, workspaceId: context.workspaceId, status: "VALID" }, data: { status: "FAILED", error: error instanceof HttpError ? error.message.slice(0, 500) : "Không thể ghi dòng này; có thể thử lại." } });
      failed++;
    }
  }
  const remaining = await prisma.importRow.count({ where: { batchId: id, workspaceId: context.workspaceId, status: "VALID" } });
  // A partially reviewed batch remains resumable, even when no VALID rows remain.
  await serializable(async db => {
    const pending = await db.importRow.count({ where: { batchId: id, workspaceId: context.workspaceId, status: { in: ["VALID", "INVALID", "FAILED"] } } });
    await db.importBatch.update({ where: { id, workspaceId: context.workspaceId }, data: { status: pending ? "PREVIEW" : "COMPLETE" } });
  });
  return { imported, failed, remaining, batch: await getImport(context.workspaceId, id) };
}

/** Safely requeue previously failed rows; transaction idempotency is preserved. */
export async function retryFailedImport(context: UserContext, id: string) {
  const batch = await prisma.importBatch.findFirst({
    where: { id, workspaceId: context.workspaceId }, select: { id: true },
  });
  if (!batch) throw new HttpError(404, "NOT_FOUND", "Không tìm thấy đợt nhập.");
  const retried = await prisma.$transaction(async tx => {
    await requireWorkspacePremiumInDb(tx, context.workspaceId, "STATEMENT_IMPORT");
    const updated = await tx.importRow.updateMany({
      where: { batchId: id, workspaceId: context.workspaceId, status: "FAILED" },
      data: { status: "VALID", error: null },
    });
    if (updated.count > 0) await tx.importBatch.updateMany({
      where: { id, workspaceId: context.workspaceId }, data: { status: "PREVIEW" },
    });
    return updated.count;
  });
  return { retried, batch: await getImport(context.workspaceId, id) };
}
