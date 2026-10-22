import { createHash } from "node:crypto";
import { z } from "zod";
import { parseImportFile } from "@/lib/import-files";
import { csvDay, safeCsvText } from "@/lib/csv-import";
import { parseVnd } from "@/lib/money";
import { vndDayStart } from "@/lib/dates";
import { bankEnvelope, type BankEnvelope } from "./domain";

export const statementMapping = z.object({
  walletId: z.string().min(1),
  dateColumn: z.string().min(1).max(100),
  inflowColumn: z.string().max(100).optional(),
  outflowColumn: z.string().max(100).optional(),
  descriptionColumn: z.string().min(1).max(100),
  referenceColumn: z.string().max(100).optional(),
  cutoverDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict().refine(x => !!x.inflowColumn || !!x.outflowColumn, "Cần chọn ít nhất một cột thu hoặc chi.")
  .refine(x => !x.inflowColumn || x.inflowColumn !== x.outflowColumn, "Hai cột thu/chi phải khác nhau.");

export type StatementMapping = z.infer<typeof statementMapping>;

export async function readBankStatement(file: File, raw: unknown) {
  const options = statementMapping.parse(raw);
  const { rows, fileHash } = await parseImportFile(file);
  const previewToken = createHash("sha256").update(JSON.stringify([fileHash, options])).digest("hex");
  const columns = rows[0].map(value => value.trim());
  if (new Set(columns).size !== columns.length) throw new Error("Trùng tiêu đề cột sao kê.");
  const getIndex = (column: string | undefined) => column ? columns.indexOf(column) : -1;
  if ([options.dateColumn, options.descriptionColumn, options.inflowColumn, options.outflowColumn, options.referenceColumn]
    .filter((x): x is string => !!x).some(x => getIndex(x) < 0)) throw new Error("Thiếu cột được ánh xạ.");
  const dayCutover = csvDay(options.cutoverDay);
  const seenNativeIds = new Set<string>();
  const parsed = rows.slice(1).map((cells, position) => {
    const rowNumber = position + 2;
    try {
      const date = csvDay(cells[getIndex(options.dateColumn)]);
      if (date > csvDay(new Date().toISOString().slice(0, 10))) throw new Error("Ngày tương lai không được hỗ trợ.");
      const description = safeCsvText(cells[getIndex(options.descriptionColumn)]);
      const bankReference = options.referenceColumn ? safeCsvText(cells[getIndex(options.referenceColumn)]) : "";
      const readAmount = (name?: string) => {
        const value = name ? cells[getIndex(name)].trim() : "";
        if (!value || value === "0") return "0";
        return parseVnd(value).toFixed(0);
      };
      const inflow = readAmount(options.inflowColumn), outflow = readAmount(options.outflowColumn);
      if ((inflow === "0") === (outflow === "0")) throw new Error("Mỗi dòng phải có đúng một chiều thu hoặc chi.");
      const nativeId = bankReference || null;
      // Duplicate references inside one file are suspicious; never silently collapse them.
      if (nativeId && seenNativeIds.has(nativeId)) throw new Error("Trùng mã tham chiếu trong cùng sao kê; cần tra soát.");
      if (nativeId) seenNativeIds.add(nativeId);
      const transaction = bankEnvelope.shape.transactions.element.parse({
        externalTransactionId: null, bankReference: nativeId, amount: inflow === "0" ? outflow : inflow,
        currency: "VND", direction: inflow === "0" ? "OUT" : "IN", occurredAt: vndDayStart(date).toISOString(),
        bookedAt: vndDayStart(date).toISOString(), bookingStatus: "BOOKED", descriptionRaw: description, sourceVersion: "statement-v1",
      });
      return { rowNumber, status: "VALID" as const, date, transaction, error: null };
    } catch (error) {
      return { rowNumber, status: "INVALID" as const, date: null, transaction: null,
        error: error instanceof Error ? error.message : "Dữ liệu không hợp lệ." };
    }
  });
  const validCount = parsed.filter(row => row.status === "VALID").length;
  return { fileHash, previewToken, fileName: file.name.slice(0, 200), cutoverAt: vndDayStart(dayCutover),
    walletId: options.walletId, validCount, invalidCount: parsed.length - validCount, total: parsed.length,
    rows: parsed };
}

export function statementEnvelope(fileHash: string, walletId: string, row: Awaited<ReturnType<typeof readBankStatement>>["rows"][number], accountRef: string): BankEnvelope {
  if (!row.transaction) throw new Error("Cannot stage an invalid statement row.");
  return { eventId: createHash("sha256").update(JSON.stringify(["statement-v1", fileHash, walletId, row.rowNumber])).digest("hex"),
    accountRef, transactions: [row.transaction] };
}
