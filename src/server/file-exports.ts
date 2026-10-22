import ExcelJS from "exceljs";
import pdfMake from "pdfmake/build/pdfmake";
import vfsFonts from "pdfmake/build/vfs_fonts";
import type { TDocumentDefinitions, Content } from "pdfmake/interfaces";
import { loadTransactionExport, exportHeaders } from "@/server/csv-export";
import { overview, type ReportFilter } from "@/server/reporting";
import { formatVnd } from "@/lib/money";
import { vndDayStart } from "@/lib/dates";
import { Decimal } from "decimal.js";

const financeDefinitions = [
  ["Thu nhập", "Tổng số dư tăng ròng của tài khoản INCOME trong khoảng [từ ngày, đến trước ngày)."],
  ["Chi phí ròng", "Tổng bút toán EXPENSE, đã trừ khoản hoàn tiền và điều chỉnh bằng bút toán đảo."],
  ["Thặng dư", "Thu nhập trừ chi phí ròng; khác với biến động số dư ví khi có chuyển tiền và số dư mở đầu."],
  ["Số dư khả dụng", "Tổng số dư các ví được đánh dấu khả dụng đến hết ngày thực tế cuối cùng trong kỳ."],
  ["Phạm vi", "Chỉ dữ liệu workspace đã xác thực. VND, múi giờ Asia/Ho_Chi_Minh."],
  ["Chi phí ròng trong giao dịch", "Chi EXPENSE là số dương; REFUND là số âm; chuyển ví và thu nhập bằng 0."],
  ["Chi tiết giao dịch", "Chỉ gồm Transaction ACTIVE theo ngày giao dịch. Tổng KPI lấy từ Journal/Posting, còn gồm lãi vay, thẻ tín dụng và phí chuyển tiền; không cộng chi tiết giao dịch để thay KPI."],
];

async function load(workspaceId: string, filter: ReportFilter) {
  const report = await overview(workspaceId, filter);
  const exportData = await loadTransactionExport(workspaceId, filter, vndDayStart(report.period.actualEndExclusive));
  return { report, ...exportData };
}

function cellAmount(value: string): string | number {
  // Excel represents numeric cells as IEEE754; large VND amounts must remain text to preserve precision.
  return BigInt(value) <= BigInt(Number.MAX_SAFE_INTEGER) && BigInt(value) >= BigInt(-Number.MAX_SAFE_INTEGER) ? Number(value) : value;
}

function header(sheet: ExcelJS.Worksheet) {
  const row = sheet.getRow(1);
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E5EFF" } };
  row.alignment = { vertical: "middle" };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: row.cellCount } };
  sheet.columns.forEach(column => { column.width = 24; });
}

export async function reportXlsx(workspaceId: string, filter: ReportFilter = {}) {
  const { report, period, records } = await load(workspaceId, filter);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Finova";
  workbook.created = new Date();
  const overviewSheet = workbook.addWorksheet("Tổng quan");
  overviewSheet.addRow(["Chỉ số", "Giá trị (VND hoặc %)"]);
  const summary = [
    ["Kỳ từ ngày", period.start], ["Đến trước ngày", period.endExclusive],
    ["Dữ liệu thực tế đến trước", report.period.actualEndExclusive],
    ["Lọc ví", report.filters.walletId ?? "Tất cả"],
    ["Lọc danh mục", report.filters.categoryId ?? "Tất cả"],
    ["Múi giờ", "Asia/Ho_Chi_Minh"], ["Đơn vị", "VND"],
    ["Ngày xuất", new Date().toISOString()],
    ["Phạm vi chi tiết", "Giao dịch ACTIVE đến giới hạn dữ liệu thực tế; KPI từ sổ cái bao gồm cả nghiệp vụ thẻ/vay/phí."],
    ["Thu nhập", report.kpis.income], ["Chi phí ròng", report.kpis.expense],
    ["Thặng dư", report.kpis.surplus], ["Số dư khả dụng", report.kpis.available],
    ["Tỷ lệ tiết kiệm (%)", report.kpis.savingsRate ?? "Không xác định"],
  ];
  summary.forEach(([name, value]) => overviewSheet.addRow([name, value]));
  header(overviewSheet); overviewSheet.getColumn(1).width = 32; overviewSheet.getColumn(2).width = 38;

  const incomeSheet = workbook.addWorksheet("Thu chi");
  incomeSheet.addRow(["Ngày", "Thu nhập (VND)", "Chi phí ròng (VND)", "Thặng dư (VND)"]);
  report.series.forEach(row => incomeSheet.addRow([row.date, cellAmount(row.income), cellAmount(row.expense), cellAmount(row.surplus)]));
  header(incomeSheet);

  const categorySheet = workbook.addWorksheet("Theo danh mục");
  categorySheet.addRow(["Danh mục", "Chi phí ròng (VND)"]);
  report.categories.forEach(row => categorySheet.addRow([row.name, cellAmount(row.amount)]));
  header(categorySheet); categorySheet.getColumn(1).width = 38;

  const detail = workbook.addWorksheet("Giao dịch chi tiết");
  detail.addRow(exportHeaders);
  records.forEach(row => detail.addRow(row.map((value, index) => index >= 6 && index <= 8 ? cellAmount(value) : value)));
  header(detail); detail.getColumn(10).width = 46;
  // Imported workbook formulas cannot execute because all user data is stored as literal cell text.
  const definitionSheet = workbook.addWorksheet("Định nghĩa chỉ số");
  definitionSheet.addRow(["Chỉ số", "Cách tính và phạm vi"]);
  financeDefinitions.forEach(row => definitionSheet.addRow(row));
  header(definitionSheet); definitionSheet.getColumn(1).width = 36; definitionSheet.getColumn(2).width = 104;

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

type CategoryRow = { name: string; amount: string };

export function topChartCategories(rows: CategoryRow[]): CategoryRow[] {
  // Any negative net expense (refund/reversal) invalidates a positive-only comparison.
  if (rows.some(row => new Decimal(row.amount).isNegative())) return [];
  return [...rows]
    .filter(row => new Decimal(row.amount).greaterThan(0))
    .sort((a, b) => new Decimal(b.amount).comparedTo(a.amount) || a.name.localeCompare(b.name, "vi"))
    .slice(0, 7);
}

function categoryChart(rows: CategoryRow[]): Content[] {
  const top = topChartCategories(rows);
  if (!top.length) return [];
  const max = new Decimal(top[0].amount);
  return top.map((row, i) => {
    // Decimal division precedes Number conversion so even VND > 2^53 compares correctly.
    const barWidth = Math.max(1, new Decimal(row.amount).div(max).mul(460).toDecimalPlaces(0).toNumber());
    const color = i % 2 ? "#18C5C2" : "#1E5EFF";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="460" height="12" viewBox="0 0 460 12"><rect x="0" y="0" width="460" height="12" rx="4" fill="#EEF2FF"/><rect x="0" y="0" width="${barWidth}" height="12" rx="4" fill="${color}"/></svg>`;
    // Keep arbitrary category labels in PDF text (Roboto) instead of SVG, preserving
    // Vietnamese glyphs and preventing user-controlled text from entering SVG XML.
    return {
      stack: [
        { columns: [{ text: row.name, width: "*" }, { text: formatVnd(row.amount), width: "auto", bold: true, alignment: "right" }], columnGap: 8, fontSize: 9, margin: [0, 0, 0, 4] },
        { svg, width: 460 },
      ],
      margin: [0, 0, 0, 9],
      unbreakable: true,
    } as Content;
  });
}

type PdfData = {
  period: { start: string; endExclusive: string; actualEndExclusive: string };
  filters: { walletId: string | null; categoryId: string | null };
  kpis: { income: string; expense: string; surplus: string; available: string };
  categories: { name: string; amount: string }[];
};

export async function renderReportPdf(report: PdfData, generatedAt = new Date()) {
  pdfMake.addVirtualFileSystem(vfsFonts);
  const issuedAt = new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(generatedAt);
  const kpis = [
    ["Thu nhập", formatVnd(report.kpis.income)], ["Chi phí ròng", formatVnd(report.kpis.expense)],
    ["Thặng dư", formatVnd(report.kpis.surplus)], ["Số dư khả dụng", formatVnd(report.kpis.available)],
  ];
  const content: Content[] = [
    { text: "FINOVA", style: "brand" },
    { text: "Báo cáo tài chính cá nhân", style: "title" },
    { text: "Rõ tiền, vững tương lai", style: "subtitle" },
    { text: `Kỳ: ${report.period.start} đến trước ${report.period.endExclusive} · VND · Asia/Ho_Chi_Minh`, margin: [0, 12, 0, 3] },
    { text: `Dữ liệu thực tế đến trước: ${report.period.actualEndExclusive}`, margin: [0, 0, 0, 3] },
    { text: `Bộ lọc: ví ${report.filters.walletId ?? "Tất cả"}; danh mục ${report.filters.categoryId ?? "Tất cả"}`, margin: [0, 0, 0, 3] },
    { text: `Xuất lúc: ${issuedAt}`, margin: [0, 0, 0, 16] },
    { text: "Chỉ số tổng quan", style: "section" },
    { table: { widths: ["*", "auto"], body: [
      [{ text: "Chỉ số", bold: true }, { text: "Giá trị", bold: true }], ...kpis,
    ] }, layout: "lightHorizontalLines", margin: [0, 4, 0, 18] },
    { text: "Chi phí theo danh mục", style: "section" },
  ];
  const chart = categoryChart(report.categories);
  if (chart.length) {
    content.push({ text: "Tối đa 7 danh mục chi lớn nhất theo thứ tự giảm dần; số tiền là chi phí ròng.", fontSize: 9, margin: [0, 3, 0, 8] });
    content.push(...chart);
  } else if (report.categories.some(c => new Decimal(c.amount).isNegative())) {
    content.push({ text: "Có chi phí ròng âm do hoàn tiền/điều chỉnh; chỉ hiển thị bảng để giữ nguyên dấu, không vẽ tỷ trọng gây hiểu nhầm.", fontSize: 9, margin: [0, 4, 0, 10] });
  }
  content.push({ table: { headerRows: 1, widths: ["*", "auto"], body: [
    [{ text: "Danh mục", bold: true }, { text: "Chi phí ròng", bold: true }],
    ...[...report.categories].sort((a, b) => new Decimal(b.amount).comparedTo(a.amount)).map(c => [c.name, formatVnd(c.amount)]),
    ...(report.categories.length ? [] : [["Chưa phát sinh chi phí", "0 ₫"]]),
  ] }, layout: "lightHorizontalLines", margin: [0, 0, 0, 16] });
  content.push({
    stack: [
      { text: "Nguyên tắc tính", style: "section" },
      ...financeDefinitions.slice(0, 4).map(([name, rule]) => ({ text: `${name}: ${rule}`, margin: [0, 3, 0, 3] as [number, number, number, number], fontSize: 9 })),
    ],
    unbreakable: true,
  });
  const doc: TDocumentDefinitions = {
    pageSize: "A4", pageMargins: [42, 42, 42, 50], content,
    defaultStyle: { font: "Roboto", fontSize: 10, color: "#0B1F4A" },
    styles: {
      brand: { fontSize: 16, bold: true, color: "#1E5EFF" },
      title: { fontSize: 20, bold: true, margin: [0, 8, 0, 4] },
      subtitle: { color: "#087D79", fontSize: 10 },
      section: { bold: true, fontSize: 13, color: "#1E5EFF", margin: [0, 10, 0, 7] },
    },
    footer: (currentPage, pageCount) => ({ text: `Finova · ${currentPage}/${pageCount}`, alignment: "center", color: "#64748b", fontSize: 8 }),
  };
  return Buffer.from(await pdfMake.createPdf(doc).getBuffer());
}

export async function reportPdf(workspaceId: string, filter: ReportFilter = {}) {
  const { report } = await load(workspaceId, filter);
  return renderReportPdf(report);
}
