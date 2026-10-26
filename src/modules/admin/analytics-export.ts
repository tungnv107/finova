import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { getUsageKpis, usageAnalyticsEnabled } from "./usage";
import { vietnamUsageDay } from "./usage-domain";
import { HttpError } from "@/server/context";

export type AdminExportKind = "billing" | "traffic";
export type AdminExportFormat = "csv" | "xlsx";
export type AdminExportDays = 7 | 30 | 90;
type Cell = string | number;
export type AdminAggregateReport = {
  kind: AdminExportKind;
  days: AdminExportDays;
  fromVn: string;
  untilVn: string;
  columns: string[];
  rows: Cell[][];
};

/** Vietnam calendar boundaries converted to UTC instants for timestamp filters. */
export function adminExportPeriod(days: AdminExportDays, now = new Date()) {
  const todayVn = vietnamUsageDay(now);
  const firstVn = new Date(todayVn.getTime() - (days - 1) * 86400000);
  const exclusiveVn = new Date(todayVn.getTime() + 86400000);
  return {
    fromVn: firstVn.toISOString().slice(0, 10),
    untilVn: todayVn.toISOString().slice(0, 10),
    startUtc: new Date(firstVn.getTime() - 7 * 3600000),
    endUtc: new Date(exclusiveVn.getTime() - 7 * 3600000),
  };
}

/** Aggregate-only export; no user IDs, bank references, wallet, order or financial ledger rows. */
export async function prepareAdminAggregateReport(kind: AdminExportKind, days: AdminExportDays, now = new Date()): Promise<AdminAggregateReport> {
  const period = adminExportPeriod(days, now);
  const common = { kind, days, fromVn: period.fromVn, untilVn: period.untilVn };
  if (kind === "traffic") {
    if (!usageAnalyticsEnabled()) throw new HttpError(409, "USAGE_ANALYTICS_DISABLED", "Thống kê truy cập chưa được bật.");
    const data = await getUsageKpis(now);
    return { ...common,
      columns: ["Ngày (Việt Nam)", "Người dùng hoạt động", "Lượt xem trang", "Múi giờ"],
      rows: data.trends.slice(-days).map(day => [day.day, day.activeUsers, day.pageViews, "Asia/Ho_Chi_Minh"]),
    };
  }
  const between = { gte: period.startUtc, lt: period.endUtc };
  const [created, paid, allocation] = await Promise.all([
    prisma.billingOrder.count({ where: { createdAt: between } }),
    prisma.billingOrder.count({ where: { status: "PAID", paidAt: between } }),
    prisma.paymentAllocation.aggregate({ where: { matchedAt: between }, _count: { _all: true }, _sum: { amountVnd: true } }),
  ]);
  const allocatedVnd = allocation._sum.amountVnd ?? 0;
  if (!Number.isSafeInteger(Number(allocatedVnd))) {
    throw new HttpError(409, "EXPORT_TOTAL_OUT_OF_RANGE", "Tổng tiền vượt giới hạn xuất báo cáo chính xác.");
  }
  return { ...common,
    columns: ["Từ ngày VN", "Đến ngày VN", "Chỉ số", "Giá trị", "Đơn vị", "Múi giờ"],
    rows: [
      [period.fromVn, period.untilVn, "Đơn hàng được tạo", created, "đơn", "Asia/Ho_Chi_Minh"],
      [period.fromVn, period.untilVn, "Đơn ở trạng thái PAID", paid, "đơn", "Asia/Ho_Chi_Minh"],
      [period.fromVn, period.untilVn, "Thanh toán đã phân bổ", allocation._count._all, "giao dịch", "Asia/Ho_Chi_Minh"],
      [period.fromVn, period.untilVn, "Tiền đã phân bổ (gross, chưa trừ hoàn tiền)", Number(allocatedVnd), "VND", "Asia/Ho_Chi_Minh"],
    ],
  };
}

function csvCell(value: Cell) {
  if (typeof value === "number") return String(value);
  // Formula-safe even if a future report contains a dynamic metric label.
  const safe = /^[\s]*[=+@\-\t\r]/u.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

export async function encodeAdminAggregateReport(report: AdminAggregateReport, format: AdminExportFormat): Promise<Uint8Array> {
  if (format === "csv") {
    const lines = [report.columns, ...report.rows].map(row => row.map(csvCell).join(","));
    return new TextEncoder().encode(`\uFEFF${lines.join("\r\n")}\r\n`);
  }
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Finova";
  const sheet = workbook.addWorksheet(report.kind === "billing" ? "Thu phi" : "Truy cap");
  sheet.addRow(report.columns);
  for (const row of report.rows) sheet.addRow(row);
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.columns = report.columns.map(column => ({ width: Math.max(18, Math.min(35, column.length + 6)) }));
  for (const row of sheet.getRows(2, report.rows.length) ?? []) {
    row.eachCell(cell => { if (typeof cell.value === "number") cell.numFmt = "#,##0"; });
  }
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
