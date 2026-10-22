import { prisma } from "@/lib/db";
import { parseRange } from "@/lib/dates";
import { money } from "@/lib/money";
import { HttpError } from "@/server/context";
import type { ReportFilter } from "@/server/reporting";

// Prefix untrusted spreadsheet text to prevent formula execution when Excel opens CSV.
function safeCell(input: string) {
  const value = /^[\s]*[=+\-@]|^[\t\r]/u.test(input) ? `'${input}` : input;
  return `"${value.replaceAll('"', '""')}"`;
}

export async function loadTransactionExport(workspaceId: string, filter: ReportFilter = {}, actualEnd?: Date) {
  const period = parseRange(filter.start, filter.endExclusive);
  // XLSX summaries use the same actual-data cutoff as the dashboard. A plain
  // transaction CSV intentionally exports the user's entire requested range.
  const end = actualEnd && actualEnd < period.to ? actualEnd : period.to;
  if (filter.walletId && !(await prisma.wallet.count({ where: { workspaceId, id: filter.walletId } })))
    throw new HttpError(404, "NOT_FOUND", "Ví không thuộc tài khoản của bạn.");
  if (filter.categoryId && !(await prisma.category.count({ where: { workspaceId, id: filter.categoryId } })))
    throw new HttpError(404, "NOT_FOUND", "Danh mục không thuộc tài khoản của bạn.");

  const rows = await prisma.transaction.findMany({ where: {
    workspaceId, status: "ACTIVE", occurredAt: { gte: period.from, lt: end },
    OR: filter.walletId ? [{ walletId: filter.walletId }, { destinationWalletId: filter.walletId }] : undefined,
    categoryId: filter.categoryId ?? undefined,
  }, include: { wallet: { select: { name: true } }, destinationWallet: { select: { name: true } }, category: { select: { name: true } } },
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }] });

  const records = rows.map(row => {
    const amount = money(row.amount.toString());
    return [row.id, row.occurredAt.toISOString(), row.kind, row.wallet.name,
      row.destinationWallet?.name ?? "", row.category?.name ?? "", amount,
      row.kind === "INCOME" ? amount : "0",
      row.kind === "EXPENSE" ? amount : row.kind === "REFUND" ? `-${amount}` : "0", row.note ?? ""];
  });
  return { period, records };
}

export const exportHeaders = ["ID", "Ngày giờ ISO", "Loại", "Ví nguồn", "Ví đích", "Danh mục", "Số tiền VND", "Thu nhập VND", "Chi phí ròng VND", "Ghi chú"];

export async function transactionsCsv(workspaceId: string, filter: ReportFilter = {}) {
  const { period, records } = await loadTransactionExport(workspaceId, filter);
  const header = exportHeaders;
  const numericColumns = new Set([6, 7, 8]);
  const lines = [header.map(safeCell).join(","), ...records.map(row => row.map((value, i) => numericColumns.has(i) ? value : safeCell(value)).join(","))];
  return { content: `\uFEFF${lines.join("\r\n")}\r\n`, count: records.length, period };
}
