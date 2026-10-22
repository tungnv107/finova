import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, type UserContext } from "@/server/context";
import { serializable } from "@/server/serializable";
import { providerCapabilities } from "../domain";
import { persistBankEnvelope } from "../service";
import { mapSePayHistory } from "./mapper";
import { sepayClientFromEnvironment, sepayEnabled, sepayEnvironment } from "./client";

const date = z.iso.date();
const connectionSelect = { id: true, workspaceId: true, providerConnectionRef: true, status: true } as const;

async function scopedConnection(context: UserContext, id: string) {
  const connection = await prisma.bankConnection.findFirst({ where: { id, workspaceId: context.workspaceId,
    providerCode: "SEPAY_BANKHUB", status: { not: "REVOKED" } }, select: connectionSelect });
  if (!connection || !connection.providerConnectionRef) throw new HttpError(404, "SEPAY_CONNECTION_MISSING", "Chưa có kết nối SePay hợp lệ.");
  return connection;
}

/** Each Finova workspace gets its own Bank Hub company; never accept a company_xid supplied by a browser. */
export async function startSePayLink(context: UserContext) {
  const client = sepayClientFromEnvironment();
  let connection = await prisma.bankConnection.findFirst({ where: { workspaceId: context.workspaceId,
    providerCode: "SEPAY_BANKHUB", status: { not: "REVOKED" } }, orderBy: { createdAt: "desc" }, select: connectionSelect });
  if (!connection) {
    connection = await serializable(async db => {
      await db.bankProvider.upsert({ where: { code: "SEPAY_BANKHUB" }, create: {
        code: "SEPAY_BANKHUB", displayName: "SePay Bank Hub", status: sepayEnvironment() === "sandbox" ? "SANDBOX" : "INTEGRATION",
        capabilitiesJson: providerCapabilities.SEPAY_BANKHUB }, update: { capabilitiesJson: providerCapabilities.SEPAY_BANKHUB } });
      return db.bankConnection.create({ data: { workspaceId: context.workspaceId, providerCode: "SEPAY_BANKHUB",
        status: "PAUSED", postingPolicy: "REVIEW_FIRST", cutoverAt: new Date() }, select: connectionSelect });
    });
  }
  let companyXid = connection.providerConnectionRef;
  if (!companyXid) {
    companyXid = await client.createCompany(`Finova ${context.workspaceId} ${connection.id}`);
    await prisma.bankConnection.update({ where: { id: connection.id }, data: { providerConnectionRef: companyXid } });
  }
  const link = await client.createLink(companyXid);
  await prisma.bankAuditEvent.create({ data: { workspaceId: context.workspaceId, actorType: "USER", actorId: context.userId,
    action: "SEPAY_LINK_STARTED", resourceType: "CONNECTION", resourceId: connection.id,
    metadataRedactedJson: { environment: sepayEnvironment() } } });
  return { connectionId: connection.id, hostedLinkUrl: link.hostedLinkUrl, expiresAt: link.expiresAt,
    environment: sepayEnvironment() };
}

export async function availableSePayAccounts(context: UserContext, connectionId: string) {
  const connection = await scopedConnection(context, connectionId);
  const accounts = await sepayClientFromEnvironment().listAccounts(connection.providerConnectionRef!);
  return accounts.filter(a => a.active === undefined || a.active === null || a.active === "1" || a.active === 1 || a.active === true)
    .map(a => ({ xid: a.xid, bankCode: a.bank_code ?? a.brand_name ?? "BANK",
      accountMasked: `•••• ${a.account_number.slice(-4)}` }));
}

export async function attachSePayAccount(context: UserContext, connectionId: string, accountXid: string, walletId: string,
  acceptedConsent: boolean) {
  if (!acceptedConsent) throw new HttpError(422, "CONSENT_REQUIRED", "Cần đồng ý quyền đồng bộ sao kê.");
  const connection = await scopedConnection(context, connectionId);
  const bank = (await sepayClientFromEnvironment().listAccounts(connection.providerConnectionRef!)).find(a => a.xid === accountXid);
  if (!bank || (bank.active != null && !["1", 1, true].includes(bank.active))) {
    throw new HttpError(422, "BANK_NOT_LINKED", "Tài khoản chưa được liên kết và kích hoạt trên SePay.");
  }
  return serializable(async db => {
    const wallet = await db.wallet.findFirst({ where: { workspaceId: context.workspaceId, id: walletId,
      type: "BANK", currency: "VND", archivedAt: null } });
    if (!wallet) throw new HttpError(422, "INVALID_WALLET", "Vui lòng chọn ví ngân hàng VND.");
    const used = await db.bankAccount.findFirst({ where: { workspaceId: context.workspaceId, walletId, status: "ACTIVE" } });
    if (used) throw new HttpError(409, "WALLET_ALREADY_LINKED", "Ví đã liên kết với nguồn ngân hàng khác.");
    const already = await db.bankAccount.findFirst({ where: { connectionId, providerAccountRef: accountXid } });
    if (already?.status === "ACTIVE") throw new HttpError(409, "ACCOUNT_ALREADY_LINKED", "Tài khoản đã được ánh xạ.");
    // Preserve historical ledger links: a reactivated account must return to
    // its previous wallet, otherwise old and new evidence would be mixed.
    if (already?.walletId && already.walletId !== walletId) throw new HttpError(409, "ACCOUNT_WALLET_CONFLICT",
      "Tài khoản này từng gắn với ví khác. Hãy sử dụng lại ví cũ để bảo toàn dữ liệu đối soát.");
    const details = { bankCode: bank.bank_code ?? bank.brand_name ?? null,
      accountMasked: `•••• ${bank.account_number.slice(-4)}`,
      accountIdentifierHash: createHash("sha256").update(`${bank.bank_code ?? bank.brand_name}:${bank.account_number}`).digest("hex"),
      walletId, status: "ACTIVE" };
    const account = already
      ? await db.bankAccount.update({ where: { id: already.id }, data: details })
      : await db.bankAccount.create({ data: { workspaceId: context.workspaceId, connectionId,
        providerAccountRef: bank.xid, ...details } });
    await db.bankConsent.create({ data: { workspaceId: context.workspaceId, connectionId,
      scopeJson: { transactions: true, bankAccountXid: bank.xid }, purposeVersion: "sepay-bankhub-v1",
      evidenceRef: `user:${context.userId}:bankhub:${bank.xid}`, grantedAt: new Date() } });
    await db.bankConnection.update({ where: { id: connectionId }, data: { status: "ACTIVE" } });
    await db.bankAuditEvent.create({ data: { workspaceId: context.workspaceId, actorType: "USER", actorId: context.userId,
      action: "SEPAY_ACCOUNT_LINKED", resourceType: "ACCOUNT", resourceId: account.id } });
    return { id: account.id, status: "ACTIVE" };
  });
}

/** Start SePay's official, user-confirmed unlink flow for an account owned by this workspace. */
export async function startSePayUnlink(context: UserContext, connectionId: string, accountId: string) {
  const connection = await scopedConnection(context, connectionId);
  const account = await prisma.bankAccount.findFirst({ where: { id: accountId, workspaceId: context.workspaceId,
    connectionId, status: "ACTIVE" }, select: { providerAccountRef: true } });
  if (!account) throw new HttpError(404, "SEPAY_ACCOUNT_MISSING", "Không tìm thấy tài khoản ngân hàng đã liên kết.");
  const link = await sepayClientFromEnvironment().createLink(connection.providerConnectionRef!, "UNLINK_BANK_ACCOUNT",
    account.providerAccountRef);
  await prisma.bankAuditEvent.create({ data: { workspaceId: context.workspaceId, actorType: "USER", actorId: context.userId,
    action: "SEPAY_UNLINK_STARTED", resourceType: "ACCOUNT", resourceId: accountId } });
  return { accountId, hostedLinkUrl: link.hostedLinkUrl, expiresAt: link.expiresAt };
}

/** Verify the result of a hosted unlink with SePay before retiring local mappings. */
export async function refreshSePayAccountStatuses(context: UserContext, connectionId: string) {
  const connection = await scopedConnection(context, connectionId);
  const remote = await sepayClientFromEnvironment().listAccounts(connection.providerConnectionRef!);
  const activeByRef = new Map(remote.map(a => [a.xid, a.active]));
  return serializable(async db => {
    const current = await db.bankConnection.findFirst({ where: { id: connectionId, workspaceId: context.workspaceId,
      status: { not: "REVOKED" } }, select: { status: true } });
    if (!current) throw new HttpError(409, "CONNECTION_REVOKED", "Quyền đồng bộ đã bị thu hồi.");
    const mapped = await db.bankAccount.findMany({ where: { workspaceId: context.workspaceId, connectionId, status: "ACTIVE" },
      select: { id: true, providerAccountRef: true } });
    let deactivated = 0;
    for (const account of mapped) {
      const active = activeByRef.get(account.providerAccountRef);
      // A missing/undocumented status is inconclusive. Never disconnect on a
      // transient incomplete response; only a verified inactive flag counts.
      if (active !== false && active !== 0 && active !== "0") continue;
      const result = await db.bankAccount.updateMany({ where: { id: account.id, workspaceId: context.workspaceId,
        status: "ACTIVE" }, data: { status: "INACTIVE" } });
      deactivated += result.count;
      await db.bankConsent.updateMany({ where: { workspaceId: context.workspaceId, connectionId, revokedAt: null,
        scopeJson: { path: ["bankAccountXid"], equals: account.providerAccountRef } }, data: { revokedAt: new Date() } });
      if (result.count) await db.bankAuditEvent.create({ data: { workspaceId: context.workspaceId, actorType: "USER",
        actorId: context.userId, action: "SEPAY_UNLINK_VERIFIED", resourceType: "ACCOUNT", resourceId: account.id } });
    }
    const activeCount = await db.bankAccount.count({ where: { workspaceId: context.workspaceId, connectionId, status: "ACTIVE" } });
    if (!activeCount && current.status === "ACTIVE") await db.bankConnection.update({ where: { id: connectionId }, data: { status: "PAUSED" } });
    return { deactivated, active: activeCount };
  });
}

/** The inclusive date overlap is deliberate: stable IDs dedupe IPN and paged history. */
export async function syncSePayHistory(context: UserContext, connectionId: string, rawFrom: string, rawTo: string) {
  const from = date.parse(rawFrom), to = date.parse(rawTo);
  const start = Date.parse(`${from}T00:00:00+07:00`), end = Date.parse(`${to}T00:00:00+07:00`);
  if (end < start || end - start > 31 * 86_400_000 || end > Date.now() + 86_400_000) {
    throw new HttpError(422, "INVALID_DATE_RANGE", "Chỉ cho phép đồng bộ khoảng tối đa 31 ngày.");
  }
  const connection = await scopedConnection(context, connectionId);
  if (connection.status !== "ACTIVE") throw new HttpError(409, "CONNECTION_PAUSED", "Kết nối đang tạm dừng.");
  const accounts = await prisma.bankAccount.findMany({ where: { workspaceId: context.workspaceId, connectionId, status: "ACTIVE",
    walletId: { not: null } }, select: { providerAccountRef: true } });
  if (!accounts.length) throw new HttpError(422, "NO_BANK_ACCOUNTS", "Chưa gắn tài khoản với ví.");
  const client = sepayClientFromEnvironment();
  const job = await prisma.bankSyncJob.create({ data: { workspaceId: context.workspaceId, connectionId,
    type: "SEPAY_HISTORY", status: "RUNNING", fromAt: new Date(start), toAt: new Date(end), startedAt: new Date() } });
  let accepted = 0, duplicates = 0;
  try {
    for (const account of accounts) {
      for (let page = 1; page <= 20; page++) {
        const result = await client.historyPage(connection.providerConnectionRef!, account.providerAccountRef, from, to, page);
        for (const row of result.data) {
          const envelope = mapSePayHistory(row);
          const original = Buffer.from(JSON.stringify(row));
          const canonical = Buffer.from(JSON.stringify(envelope));
          const persisted = await persistBankEnvelope("SEPAY_BANKHUB", connectionId, envelope, canonical, original);
          if (persisted.duplicate) duplicates++; else accepted++;
        }
        if (page >= result.meta.total_pages || result.meta.total_pages === 0) break;
        if (page === 20) throw new HttpError(503, "SEPAY_PAGINATION_LIMIT", "Đồng bộ cần chia thành khoảng ngày nhỏ hơn.");
      }
    }
    await prisma.bankSyncJob.update({ where: { id: job.id }, data: { status: "DONE", endedAt: new Date(), metricsJson: { accepted, duplicates } } });
    await prisma.bankConnection.update({ where: { id: connectionId }, data: { lastSyncedAt: new Date(), errorCode: null } });
    return { accepted, duplicates, jobId: job.id, note: "Giao dịch đã được xếp hàng để duyệt, chưa ghi sổ." };
  } catch (error) {
    await prisma.bankSyncJob.update({ where: { id: job.id }, data: { status: "FAILED", endedAt: new Date(),
      failureReason: error instanceof HttpError ? error.code : "SYNC_FAILED", metricsJson: { accepted, duplicates } } });
    throw error;
  }
}

/** Asia/Ho_Chi_Minh calendar-day overlap: never rely on UTC-day boundaries for bank history. */
export function sepaySyncWindow(lastSyncedAt: Date | null, now = new Date()) {
  const vietNow = new Date(now.getTime() + 7 * 3600_000);
  const earliest = new Date(Math.max((lastSyncedAt?.getTime() ?? now.getTime() - 3 * 86_400_000) - 2 * 86_400_000,
    now.getTime() - 7 * 86_400_000));
  const vietStart = new Date(earliest.getTime() + 7 * 3600_000);
  return { from: vietStart.toISOString().slice(0, 10), to: vietNow.toISOString().slice(0, 10) };
}

/** Cron entry point. One failing connection does not prevent others from catching up. */
export async function pollActiveSePayConnections() {
  if (!sepayEnabled()) return { skipped: true, processed: 0, failed: 0 };
  const targets = await prisma.bankConnection.findMany({ where: { providerCode: "SEPAY_BANKHUB", status: "ACTIVE",
    providerConnectionRef: { not: null }, accounts: { some: { status: "ACTIVE", walletId: { not: null } } } },
    select: { id: true, workspaceId: true, lastSyncedAt: true }, orderBy: { lastSyncedAt: "asc" }, take: 5 });
  let processed = 0, failed = 0;
  for (const connection of targets) {
    const existing = await prisma.bankSyncJob.findFirst({ where: { connectionId: connection.id, type: "SEPAY_HISTORY", status: "RUNNING",
      startedAt: { gt: new Date(Date.now() - 5 * 60_000) } }, select: { id: true } });
    if (existing) continue;
    const range = sepaySyncWindow(connection.lastSyncedAt);
    try {
      const systemContext = { workspaceId: connection.workspaceId, userId: "SYSTEM", name: "System", image: null };
      // A bank may have been unlinked in the provider since the last poll.
      // Retire only accounts explicitly marked inactive before downloading.
      const refreshed = await refreshSePayAccountStatuses(systemContext, connection.id);
      if (!refreshed.active) continue;
      await syncSePayHistory(systemContext, connection.id, range.from, range.to);
      processed++;
    } catch { failed++; }
  }
  return { skipped: false, processed, failed };
}
