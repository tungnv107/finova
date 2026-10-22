/** Small RFC 4180 parser; quoted newlines and doubled quotes are supported. */
export function parseCsv(text: string, maxRows = 10000): string[][] {
  const rows: string[][] = [];
  let fields: string[] = [], field = "", quoted = false, closed = false;
  const pushField = () => { fields.push(field); field = ""; closed = false; };
  const pushRow = () => { pushField(); if (fields.some(v => v.trim() !== "")) rows.push(fields); fields = []; if (rows.length > maxRows + 1) throw new Error("Tệp vượt 10.000 dòng dữ liệu."); };
  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') { quoted = false; closed = true; }
      else field += ch;
    } else if (ch === ',') pushField();
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && input[i + 1] === '\n') i++; pushRow(); }
    else if (ch === '"' && !field && !closed) quoted = true;
    else if (ch === '"' || closed) throw new Error("Định dạng dấu nháy CSV không hợp lệ.");
    else field += ch;
  }
  if (quoted) throw new Error("Tệp CSV có trường chưa đóng dấu nháy.");
  if (field || fields.length || closed) pushRow();
  if (rows.length < 2) throw new Error("Tệp CSV cần dòng tiêu đề và ít nhất một dòng dữ liệu.");
  const length = rows[0].length;
  if (length > 60 || rows.some(r => r.length !== length)) throw new Error("CSV có số cột không nhất quán hoặc vượt giới hạn.");
  return rows;
}

export function csvDay(raw: string): string {
  const trimmed = raw.trim();
  let year: number, month: number, day: number;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) [year, month, day] = trimmed.split("-").map(Number);
  else if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) [day, month, year] = trimmed.split("/").map(Number);
  else throw new Error("Ngày cần có dạng YYYY-MM-DD hoặc DD/MM/YYYY.");
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) throw new Error("Ngày không hợp lệ.");
  return date.toISOString().slice(0, 10);
}

export function safeCsvText(raw: string) {
  const value = raw.trim();
  if (/^[=+@\-\t\r]/.test(value)) throw new Error("Trường văn bản có tiền tố công thức không an toàn.");
  return value;
}
