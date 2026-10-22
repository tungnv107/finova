import { Prisma } from "@finova/prisma";
import { prisma } from "@/lib/db";
import { Decimal, normalAmount } from "@/lib/money";
import { HttpError } from "@/server/context";

type DB = Prisma.TransactionClient;
export const positiveVnd = /^([1-9]\d{0,15})$/;

export function validateKey(key?: string | null) {
  if (key && (key.length < 8 || key.length > 128))
    throw new HttpError(400, "IDEMPOTENCY_KEY", "Idempotency-Key phải dài từ 8 đến 128 ký tự.");
}

export async function activeWallet(db: DB, workspaceId: string, id: string) {
  const wallet = await db.wallet.findFirst({ where: { id, workspaceId, archivedAt: null } });
  if (!wallet) throw new HttpError(400, "INVALID_WALLET", "Ví không tồn tại, đã lưu trữ hoặc ngoài tài khoản.");
  return wallet;
}

export async function balanceOfAccount(db: DB | typeof prisma, workspaceId: string, accountId: string, kind: "ASSET" | "LIABILITY" | "RECEIVABLE", at = new Date()) {
  const postings = await db.posting.groupBy({ by: ["side"], where: {
    ledgerAccountId: accountId, account: { workspaceId, kind }, journal: { workspaceId, effectiveAt: { lte: at } },
  }, _sum: { amount: true } });
  return postings.reduce((sum, p) => sum.plus(normalAmount(kind, p.side, p._sum.amount?.toString() ?? "0")), new Decimal(0));
}

export async function interestLedger(db: DB, workspaceId: string, kind: "INCOME" | "EXPENSE") {
  const code = kind === "INCOME" ? "DEBT_INTEREST_INCOME" : "DEBT_INTEREST_EXPENSE";
  return db.ledgerAccount.upsert({ where: { workspaceId_code: { workspaceId, code } },
    create: { workspaceId, code, kind, name: kind === "INCOME" ? "Lãi cho vay" : "Lãi vay" }, update: {} });
}
