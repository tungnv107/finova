import { requirePageContext } from "@/server/page-context";
import { prisma } from "@/lib/db";
import { parseRange } from "@/lib/dates";
import { listTransactionsPage, walletBalances } from "@/server/ledger";
import { TransactionManager } from "@/components/transaction-manager";
import { transactionDetail } from "@/server/transaction-detail";
import { notFound } from "next/navigation";

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requirePageContext();
  const query = await searchParams;
  const get = (key: string) => typeof query[key] === "string" ? query[key] as string : undefined;
  const range = parseRange(get("start"), get("endExclusive"));
  const kind = get("kind");
  const typedKind = kind === "EXPENSE" || kind === "INCOME" || kind === "TRANSFER" || kind === "REFUND" ? kind : undefined;
  const sort = get("sort") === "asc" ? "asc" : "desc";
  const search = get("search")?.trim().slice(0, 200);
  const transactionId = get("transactionId");
  const categoryScope = get("categoryScope") === "subtree" && get("categoryId") ? "subtree" : "direct";
  const includeRefunds = get("includeRefunds") === "true" && typedKind === "EXPENSE";
  const feeOnly = get("feeOnly") === "true" && typedKind === "TRANSFER" && !get("categoryId");
  const [wallets, categories, page, selectedTransaction] = await Promise.all([
    walletBalances(ctx.workspaceId),
    prisma.category.findMany({ where: { workspaceId: ctx.workspaceId, archivedAt: null }, select: { id: true, name: true, kind: true }, orderBy: { name: "asc" } }),
    listTransactionsPage(ctx.workspaceId, { from: range.from, to: range.to, kind: typedKind, walletId: get("walletId"), categoryId: get("categoryId"), categoryScope, includeRefunds, feeOnly, search, sort, limit: 50 }),
    transactionId ? transactionDetail(ctx.workspaceId, transactionId) : Promise.resolve(null),
  ]);
  if (transactionId && !selectedTransaction) notFound();
  const pageIdentity = [range.start, range.endExclusive, kind, get("walletId"), get("categoryId"), categoryScope, includeRefunds, feeOnly, search, sort, transactionId, ...page.items.map(row => `${row.id}:${row.version}`)].join("|");
  return <TransactionManager key={pageIdentity} wallets={wallets} categories={categories} rows={page.items} nextCursor={page.nextCursor} selectedTransaction={selectedTransaction} initialKind={kind} initialWalletId={get("walletId")} initialCategoryId={get("categoryId")} initialCategoryScope={categoryScope} initialIncludeRefunds={includeRefunds} initialFeeOnly={feeOnly} initialSearch={search} initialSort={sort} start={range.start} endExclusive={range.endExclusive} />;
}
