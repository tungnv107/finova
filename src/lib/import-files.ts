import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import { parseCsv } from "@/lib/csv-import";

export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

/** Parse a single UTF-8 CSV or the first visible XLSX worksheet into the same staging format. */
export async function parseImportFile(file: File) {
  if (file.size === 0 || file.size > MAX_IMPORT_FILE_BYTES) throw new Error("Tệp phải có dữ liệu và không vượt 5 MB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const fileHash = createHash("sha256").update(bytes).digest("hex");
  if (file.name.toLowerCase().endsWith(".csv")) {
    const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { rows: parseCsv(content), fileHash };
  }
  if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error("Chỉ hỗ trợ tệp CSV UTF-8 hoặc XLSX.");
  if (bytes.subarray(0, 4).toString("hex") !== "504b0304") throw new Error("Định dạng XLSX không hợp lệ.");

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch {
    throw new Error("Không đọc được tệp XLSX hợp lệ.");
  }
  const sheet = workbook.worksheets.find(s => s.state === "visible");
  if (!sheet) throw new Error("Không tìm thấy trang tính hiển thị.");
  if (sheet.rowCount > 10001 || sheet.columnCount > 60) throw new Error("XLSX vượt 10.000 dòng hoặc 60 cột.");
  const rows: string[][] = [];
  const width = sheet.columnCount;
  for (let r = 1; r <= sheet.rowCount; r++) {
    const row: string[] = [];
    for (let c = 1; c <= width; c++) {
      const cell = sheet.getRow(r).getCell(c);
      if (cell.type === ExcelJS.ValueType.Formula) throw new Error("XLSX không được chứa công thức. Hãy xuất giá trị tĩnh trước khi nhập.");
      const value = cell.value;
      if (value == null) row.push("");
      else if (value instanceof Date) row.push(value.toISOString().slice(0, 10));
      else if (typeof value === "object" && "richText" in value && Array.isArray(value.richText)) {
        row.push(value.richText.map(part => part.text).join(""));
      } else if (typeof value === "object" && "text" in value && typeof value.text === "string") {
        row.push(value.text);
      } else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        row.push(String(value));
      } else {
        throw new Error(`Ô ${cell.address} có kiểu dữ liệu chưa hỗ trợ.`);
      }
    }
    if (row.some(v => v.trim() !== "")) rows.push(row);
  }
  if (rows.length < 2) throw new Error("XLSX cần dòng tiêu đề và ít nhất một dòng dữ liệu.");
  return { rows, fileHash };
}
