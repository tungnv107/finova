import { prisma } from "@/lib/db";
import { localDay, vndDayStart } from "@/lib/dates";
import { money, normalAmount } from "@/lib/money";
import { HttpError } from "@/server/context";
import { walletBalances } from "@/server/ledger";

// The as-of day is inclusive, but today's cutoff must be now: future-dated
// postings should not appear in the current balance or activity history.
export function walletCutoff(asOf?: string | null, now = new Date()) {
  if (!asOf) return now;
  let start: Date;
  try { start = vndDayStart(asOf); }
  catch { throw new HttpError(400, "INVALID_DATE", "Ngày không hợp lệ (YYYY-MM-DD)."); }
  if (asOf > localDay(now)) throw new HttpError(400, "INVALID_DATE", "Không thể xem số dư thực tế ở ngày tương lai.");
  return new Date(Math.min(now.getTime(), start.getTime() + 86400_000));
}

export async function walletLedgerDetail(workspaceId: string, walletId: string, asOf?: string | null, cursor?: string | null) {
  const cutoff = walletCutoff(asOf);
  const wallet = await prisma.wallet.findFirst({ where: { workspaceId, id: walletId } });
  if (!wallet) throw new HttpError(404, "NOT_FOUND", "Không tìm thấy ví trong tài khoản của bạn.");
  const where = { ledgerAccountId: wallet.ledgerAccountId, journal: { workspaceId, effectiveAt: { lt: cutoff } } };
  if (cursor && !(await prisma.posting.count({ where: { ...where, id: cursor } }))) {
    throw new HttpError(400, "INVALID_CURSOR", "Trang lịch sử đã thay đổi. Vui lòng tải lại.");
  }
  const [balances, postings] = await Promise.all([
    walletBalances(workspaceId, cutoff),
    prisma.posting.findMany({ where, orderBy: [{ journal: { effectiveAt: "desc" } }, { id: "desc" }],
      take: 51, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, side: true, amount: true, journal: { select: {
        id: true, kind: true, effectiveAt: true, transactionId: true,
      } } },
    }),
  ]);
  const rows = postings.slice(0, 50);
  return {
    wallet: balances.find(w => w.id === walletId)!,
    asOf: asOf ?? localDay(cutoff),
    cutoff: cutoff.toISOString(),
    entries: rows.map(row => ({
      id: row.id, journalId: row.journal.id, kind: row.journal.kind,
      occurredAt: row.journal.effectiveAt.toISOString(), transactionId: row.journal.transactionId,
      change: money(normalAmount("ASSET", row.side, row.amount.toString())),
    })),
    nextCursor: postings.length > 50 ? rows.at(-1)!.id : null,
  };
}
