import { createHash } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@finova/prisma";
import { prisma } from "@/lib/db";
import { localDay, vndDayStart } from "@/lib/dates";
import { MAX_IMPORT_FILE_BYTES, parseImportFile } from "@/lib/import-files";
import { classifyFromHistory, redactDescription } from "@/lib/ai-classification";
import { MAX_AI_STATEMENT_TEXT_LENGTH } from "@/lib/ai-statement-limits";
import { HttpError, type UserContext } from "@/server/context";
import { getImport } from "@/server/imports";
import { serializable } from "@/server/serializable";
import { requireWorkspacePremiumInDb } from "@/server/premium";
import { aiJson, type AiContent } from "./provider";
import { classificationContext } from "./classification";

export const MAX_AI_ROWS = 200;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export const statementSchema = z.object({
  currency: z.enum(["VND", "OTHER", "UNKNOWN"]), complete: z.boolean(), warnings: z.array(z.string().max(300)).max(10),
  rows: z.array(z.object({
    date: z.string().nullable(), amount: z.string().nullable(), kind: z.enum(["INCOME", "EXPENSE", "TRANSFER"]).nullable(),
    note: z.string().max(1000), reference: z.string().max(200).nullable(), categoryId: z.string().nullable(),
    confidence: z.number().min(0).max(1), categoryConfidence: z.number().min(0).max(1), reason: z.string().max(300),
  })).max(MAX_AI_ROWS),
});

export async function statementContent(file: File | string): Promise<{ content: AiContent; fileHash: string }> {
  if (typeof file === "string") {
    const normalized = file.replace(/\r\n?/g, "\n");
    if (normalized.length > MAX_AI_STATEMENT_TEXT_LENGTH) throw new HttpError(413, "STATEMENT_TOO_LARGE", "Văn bản vượt 120.000 ký tự. Hãy chia nhỏ sao kê và thử lại.");
    const text = normalized.trim();
    if (!text) throw new HttpError(400, "EMPTY_STATEMENT", "Dán nội dung sao kê cần phân tích.");
    return { fileHash: hash(`statement-text:${text}`), content: { type: "input_text", text: JSON.stringify({ statementText: text }) } };
  }
  if (!file.size || file.size > MAX_IMPORT_FILE_BYTES) throw new HttpError(413, "FILE_SIZE", "Tệp phải có dữ liệu và không vượt 5 MB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  const signature = bytes.subarray(0, 8).toString("hex");
  const ole = signature === "d0cf11e0a1b11ae1";
  const zip = signature.startsWith("504b0304");
  const types: Record<string, [string, boolean]> = {
    pdf: ["application/pdf", bytes.subarray(0, 5).toString() === "%PDF-"],
    png: ["image/png", signature === "89504e470d0a1a0a"],
    jpg: ["image/jpeg", signature.startsWith("ffd8ff")], jpeg: ["image/jpeg", signature.startsWith("ffd8ff")],
    webp: ["image/webp", bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP"],
    doc: ["application/msword", ole], docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", zip],
    xls: ["application/vnd.ms-excel", ole],
    xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", zip], csv: ["text/csv", true],
  };
  const type = types[ext];
  if (!type || !type[1]) throw new HttpError(415, "FILE_TYPE", "Tệp không đúng định dạng. Hỗ trợ PNG, JPG, WebP, PDF, DOC/DOCX, XLS/XLSX và CSV.");
  const fileHash = hash(bytes.toString("base64"));
  // Send exact cells instead of provider spreadsheet summaries; never silently truncate XLSX/CSV.
  if (ext === "xlsx" || ext === "csv") {
    let rows: string[][];
    try { ({ rows } = await parseImportFile(file)); }
    catch { throw new HttpError(400, "INVALID_SHEET", "Không đọc được bảng tính. Hãy dùng giá trị tĩnh và trang tính đầu tiên."); }
    if (rows.length > 250 || JSON.stringify(rows).length > 120000) throw new HttpError(400, "STATEMENT_TOO_LARGE", "Hãy chia bảng tính thành các tệp tối đa 200 giao dịch và 250 dòng gồm tiêu đề.");
    return { fileHash, content: { type: "input_text", text: JSON.stringify({ statementCells: rows }) } };
  }
  const data = `data:${type[0]};base64,${bytes.toString("base64")}`;
  return { fileHash, content: type[0].startsWith("image/") ? { type: "input_image", image_url: data, detail: "high" } : { type: "input_file", filename: `statement.${ext}`, file_data: data } };
}

export function statementIdentity(walletId: string, row: { reference?: string | null; kind: string | null; date: string | null; amount: string | null; note: string }, occurrence = 0) {
  // Category corrections must not make an already imported bank movement importable again.
  return hash(JSON.stringify(row.reference ? ["bank-reference", walletId, row.reference.trim()] : ["bank-movement", walletId, row.kind, row.date, row.amount, row.note.trim().toLowerCase(), occurrence]));
}

export async function previewAiStatement(context: UserContext, file: File | string, walletId: string) {
  if (!await prisma.wallet.count({ where: { id: walletId, workspaceId: context.workspaceId, archivedAt: null } })) throw new HttpError(422, "INVALID_WALLET", "Ví không hợp lệ.");
  // Check the AI staging columns before sending the user's statement to a paid provider.
  try {
    await prisma.importRow.findFirst({ where: { workspaceId: context.workspaceId }, select: {
      sourceReference: true, confidence: true, categoryReason: true, needsReview: true,
    } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2021", "P2022"].includes(error.code)) {
      console.warn("AI statement schema unavailable", { prismaCode: error.code, migration: "20261029090000_ai_statement_review" });
      throw new HttpError(503, "AI_IMPORT_MIGRATION_REQUIRED", "Cơ sở dữ liệu chưa được cập nhật cho nhập sao kê AI. Quản trị viên cần chạy migration 20261029090000_ai_statement_review trên máy chủ.");
    }
    throw error;
  }
  const { content, fileHash } = await statementContent(file);
  const { categories, history } = await classificationContext(context.workspaceId);
  const extracted = await aiJson("bank_statement", `Read every transaction from this bank statement, at most ${MAX_AI_ROWS}. Return complete=false if unreadable, cropped, missing pages, over the limit or only a summary is available. Never invent rows. Preserve identical real transactions separately. Exclude opening/closing balances, totals and headers. Amount is positive integer VND without separators; debit is EXPENSE and credit INCOME. TRANSFER only when clearly an internal transfer between the user's own accounts. Preserve bank transaction reference, or null. Date is YYYY-MM-DD; ambiguous fields must be null and low confidence. Never infer currency from language alone. Match only allowed category IDs of the same kind, otherwise null. Confidence refers to extraction, categoryConfidence to category. Explain uncertainty in Vietnamese.`,
    [{ type: "input_text", text: JSON.stringify({ today: localDay(new Date()), categories, examples: history.slice(0, 60).map(h => ({ ...h, note: redactDescription(h.note ?? "") })) }) }, content], statementSchema);
  if (!extracted.complete || !extracted.rows.length) throw new HttpError(422, "STATEMENT_INCOMPLETE", content.type === "input_image"
    ? "AI chưa đọc được đầy đủ ảnh sao kê. Hãy dùng ảnh rõ nét, đủ nội dung hoặc Dán văn bản. Nếu ảnh rõ vẫn không đọc được, quản trị viên cần kiểm tra model đọc ảnh (LLM__VisionModelId)."
    : "Chưa đọc được đầy đủ sao kê. Hãy gửi nội dung đầy đủ, rõ ràng và tối đa 200 giao dịch mỗi lần.");
  if (extracted.currency !== "VND") throw new HttpError(422, "STATEMENT_CURRENCY", "Chỉ nhập sao kê được xác định rõ bằng VND. Hãy kiểm tra đơn vị tiền trong sao kê.");
  const occurrences = new Map<string, number>();
  const seen = new Set<string>();
  const prepared: Prisma.ImportRowCreateManyInput[] = extracted.rows.map((row, index) => {
    const suggestion = row.kind ? classifyFromHistory(row.note, row.kind, categories, history) : null;
    const categoryId = suggestion?.categoryId ?? row.categoryId;
    const categoryConfidence = suggestion?.categoryId ? suggestion.confidence : row.categoryConfidence;
    const validCategory = categories.some(c => c.id === categoryId && c.kind === row.kind);
    let date: Date | null = null;
    try { if (row.date) date = vndDayStart(row.date); } catch { /* Keep row visible for correction. */ }
    const validAmount = row.amount !== null && /^[1-9]\d{0,15}$/.test(row.amount);
    const reason = !date || row.date! > localDay(new Date()) ? "Cần kiểm tra ngày giao dịch." : !validAmount ? "Cần kiểm tra số tiền." : !row.kind ? "Cần chọn loại giao dịch." : row.kind === "TRANSFER" ? "Cần chọn ví nhận cho chuyển nội bộ." : !validCategory || categoryConfidence < 0.8 ? "Cần xác nhận danh mục." : row.confidence < 0.9 ? "Cần xác nhận nội dung AI đọc được." : null;
    const base = statementIdentity(walletId, row);
    const occurrence = occurrences.get(base) ?? 0;
    occurrences.set(base, occurrence + 1);
    const sourceHash = statementIdentity(walletId, row, occurrence);
    const duplicate = seen.has(sourceHash);
    seen.add(sourceHash);
    return { id: crypto.randomUUID(), workspaceId: context.workspaceId, batchId: "", rowNumber: index + 1, sourceHash,
      sourceReference: row.reference, confidence: row.confidence, categoryReason: suggestion?.categoryId ? suggestion.reason : row.reason,
      kind: row.kind, walletId, categoryId: validCategory ? categoryId : null, amount: validAmount ? row.amount : null, occurredAt: date, note: row.note,
      needsReview: Boolean(reason), status: duplicate ? "DUPLICATE" : reason ? "INVALID" : "VALID", error: duplicate ? "Trùng mã giao dịch trong tệp." : reason };
  });
  const prior = await prisma.importRow.findMany({ where: { workspaceId: context.workspaceId, status: "IMPORTED", sourceHash: { in: prepared.map(r => r.sourceHash) } }, select: { sourceHash: true } });
  const hashes = new Set(prior.map(r => r.sourceHash));
  for (const row of prepared) if (hashes.has(row.sourceHash)) { row.status = "DUPLICATE"; row.error = "Giao dịch đã được nhập trước đó."; }
  const batch = await prisma.$transaction(async tx => {
    await requireWorkspacePremiumInDb(tx, context.workspaceId, "STATEMENT_IMPORT");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${context.workspaceId + walletId + fileHash}))`;
    const previous = await tx.importBatch.findFirst({ where: { workspaceId: context.workspaceId, fileHash,
      rows: { some: { walletId, confidence: { not: null } } } }, orderBy: { createdAt: "asc" } });
    if (previous) return previous;
    const batch = await tx.importBatch.create({ data: { workspaceId: context.workspaceId, createdById: context.userId, fileName: typeof file === "string" ? "Sao kê từ văn bản" : file.name.slice(0, 200), fileHash } });
    await tx.importRow.createMany({ data: prepared.map(row => ({ ...row, batchId: batch.id })) });
    return batch;
  });
  return { ...await getImport(context.workspaceId, batch.id), warnings: extracted.warnings };
}

export const reviewStatementSchema = z.object({ kind: z.enum(["INCOME", "EXPENSE", "TRANSFER"]), amount: z.string().regex(/^[1-9]\d{0,15}$/), date: z.iso.date(),
  categoryId: z.string().nullable(), destinationWalletId: z.string().nullable(), note: z.string().max(1000), confirmed: z.literal(true) }).strict();

export async function reviewStatementRow(context: UserContext, batchId: string, rowId: string, raw: unknown) {
  const input = reviewStatementSchema.parse(raw);
  if (input.date > localDay(new Date())) throw new HttpError(422, "FUTURE_DATE", "Không thể nhập giao dịch tương lai.");
  return serializable(async tx => {
    await requireWorkspacePremiumInDb(tx, context.workspaceId, "STATEMENT_IMPORT");
    // Same row lock as commitImport: corrections cannot race with journal creation.
    const claimed = await tx.importRow.updateMany({ where: { id: rowId, batchId, workspaceId: context.workspaceId, transactionId: null, status: { in: ["VALID", "INVALID", "FAILED"] } }, data: { error: null } });
    if (!claimed.count) throw new HttpError(409, "ROW_NOT_EDITABLE", "Dòng đã nhập, bị trùng hoặc không còn có thể chỉnh sửa.");
    const row = await tx.importRow.findUniqueOrThrow({ where: { id: rowId } });
    if (input.kind === "TRANSFER") {
      if (!input.destinationWalletId || input.destinationWalletId === row.walletId || !await tx.wallet.count({ where: { id: input.destinationWalletId, workspaceId: context.workspaceId, archivedAt: null } })) throw new HttpError(422, "INVALID_WALLET", "Chọn một ví nhận khác ví nguồn.");
    } else if (!input.categoryId || !await tx.category.count({ where: { id: input.categoryId, workspaceId: context.workspaceId, kind: input.kind, archivedAt: null } })) throw new HttpError(422, "INVALID_CATEGORY", "Chọn danh mục phù hợp loại giao dịch.");
    // The immutable source identity survives human corrections and model reclassification.
    const duplicate = await tx.importRow.count({ where: { workspaceId: context.workspaceId, sourceHash: row.sourceHash, status: "IMPORTED", id: { not: row.id } } });
    await tx.importRow.update({ where: { id: rowId }, data: { kind: input.kind, amount: input.amount, occurredAt: vndDayStart(input.date), note: input.note,
      categoryId: input.kind === "TRANSFER" ? null : input.categoryId, destinationWalletId: input.kind === "TRANSFER" ? input.destinationWalletId : null,
      needsReview: false, status: duplicate ? "DUPLICATE" : "VALID", error: duplicate ? "Đã nhập trong đợt khác." : null } });
    await tx.importBatch.update({ where: { id: batchId, workspaceId: context.workspaceId }, data: { status: "PREVIEW" } });
    return { updated: true };
  });
}
