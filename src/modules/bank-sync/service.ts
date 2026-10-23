import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, type UserContext } from "@/server/context";
import { serializable } from "@/server/serializable";
import { createTransactionInDb } from "@/server/ledger";
import { bankBookingTransition, bankEnvelope, bankFingerprint, digest, openBankEvent, providerCapabilities, sealBankEvent, type BankEnvelope } from "./domain";
import { readBankStatement, statementEnvelope, type StatementMapping } from "./statement";

export async function listBankConnections(workspaceId: string) {
  return prisma.bankConnection.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" },
    select: { id: true, providerCode: true, status: true, postingPolicy: true, lastSyncedAt: true, cutoverAt: true,
      consentExpiresAt: true, accounts: { select: { id: true, accountMasked: true, walletId: true, status: true } } } });
}

/** A synthetic account tied to a user-selected wallet; never represents a bank authorization. */
export async function createSandboxConnection(context: UserContext, walletId: string) {
  const { isSandboxEnabled } = await import("./domain");
  if (!isSandboxEnabled()) throw new HttpError(404, "SANDBOX_DISABLED", "Môi trường giả lập chưa được bật.");
  return serializable(async db => {
    const wallet = await db.wallet.findFirst({ where: { id: walletId, workspaceId: context.workspaceId, type: "BANK", archivedAt: null, currency: "VND" } });
    if (!wallet) throw new HttpError(422, "INVALID_WALLET", "Chọn ví ngân hàng VND hợp lệ.");
    const linked = await db.bankAccount.findFirst({ where: { workspaceId: context.workspaceId, walletId, status: "ACTIVE" }, select: { id: true } });
    if (linked) throw new HttpError(409, "WALLET_ALREADY_LINKED", "Ví đã được ánh xạ với nguồn sao kê khác.");
    await db.bankProvider.upsert({ where: { code: "SANDBOX" }, create: { code: "SANDBOX", displayName: "Nguồn thử nghiệm nội bộ", status: "SANDBOX", capabilitiesJson: providerCapabilities.SANDBOX }, update: {} });
    const created = await db.bankConnection.create({ data: {
      workspaceId: context.workspaceId, providerCode: "SANDBOX", status: "ACTIVE", postingPolicy: "REVIEW_FIRST", cutoverAt: new Date(),
    } });
    await db.bankConsent.create({ data: { workspaceId: context.workspaceId, connectionId: created.id,
      scopeJson: { transactions: true, simulated: true }, purposeVersion: "sandbox-v1", evidenceRef: `sandbox:${crypto.randomUUID()}`, grantedAt: new Date() } });
    const account = await db.bankAccount.create({ data: { workspaceId: context.workspaceId, connectionId: created.id,
      providerAccountRef: `test-${crypto.randomUUID()}`, accountMasked: "•••• THỬ NGHIỆM", walletId } });
    await db.bankAuditEvent.create({ data: { workspaceId: context.workspaceId, actorType: "USER", actorId: context.userId, action: "SANDBOX_CONNECT", resourceType: "CONNECTION", resourceId: created.id } });
    return { id: created.id, accountRef: account.providerAccountRef, label: "SANDBOX – chỉ dữ liệu mô phỏng" };
  });
}

/** Validated, authenticated webhook/file goes to encrypted durable inbox before acknowledgement. */
export async function persistBankEnvelope(providerCode: "SANDBOX" | "STATEMENT_IMPORT" | "SEPAY_BANKHUB", connectionId: string, envelope: BankEnvelope, rawBody: Uint8Array, originalSource?: Uint8Array) {
  const input = bankEnvelope.parse(envelope);
  // Hash the normalized financial meaning, not volatile SePay delivery metadata.
  const hash = digest(rawBody);
  // Encryption is mandatory: missing key prevents acknowledgement and plaintext persistence.
  const ciphertext = sealBankEvent(originalSource ? Buffer.from(JSON.stringify({ envelope: input, originalBase64: Buffer.from(originalSource).toString("base64") })) : rawBody);
  return serializable(async db => {
    const connection = await db.bankConnection.findFirst({ where: { id: connectionId, providerCode, status: "ACTIVE" },
      include: { accounts: { where: { providerAccountRef: input.accountRef, status: "ACTIVE", currency: "VND" } },
        consents: { where: { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } } } });
    if (!connection || connection.accounts.length !== 1 || !bankConsentAllowsAccount(connection.consents, providerCode, input.accountRef) ||
        (connection.consentExpiresAt && connection.consentExpiresAt <= new Date())) {
      throw new HttpError(403, "UNAUTHORIZED_BANK_ACCOUNT", "Nguồn hoặc tài khoản không được phép đồng bộ.");
    }
    const key = { providerCode_connectionId_externalEventId: { providerCode, connectionId, externalEventId: input.eventId } };
    const previous = await db.bankRawEvent.findUnique({ where: key, select: { id: true, payloadHash: true } });
    if (previous) {
      if (previous.payloadHash !== hash) throw new HttpError(409, "EVENT_ID_CONFLICT", "Mã sự kiện đã được dùng cho nội dung khác.");
      await db.bankRawEvent.update({ where: { id: previous.id }, data: { deliveryCount: { increment: 1 } } });
      return { id: previous.id, duplicate: true };
    }
    const event = await db.bankRawEvent.create({ data: { workspaceId: connection.workspaceId, providerCode, connectionId,
      externalEventId: input.eventId, payloadHash: hash, payloadCiphertext: ciphertext,
      signatureValid: providerCode === "SANDBOX" } });
    await db.bankSyncOutbox.create({ data: { eventType: "BANK_EVENT", aggregateId: event.id } });
    return { id: event.id, duplicate: false };
  });
}

/** SePay consent belongs to an individual linked account, not its sibling accounts. */
export function bankConsentAllowsAccount(consents: { scopeJson: unknown }[], providerCode: string, accountRef: string) {
  if (providerCode !== "SEPAY_BANKHUB") return consents.length > 0;
  return consents.some(consent => {
    const scope = consent.scopeJson;
    return !!scope && typeof scope === "object" && !Array.isArray(scope) &&
      (scope as Record<string, unknown>).transactions === true &&
      (scope as Record<string, unknown>).bankAccountXid === accountRef;
  });
}

/** Each event is processed atomically with its canonical rows and review entries. */
async function processEvent(id: string) {
  return serializable(async db => {
    const event = await db.bankRawEvent.findUniqueOrThrow({ where: { id }, include: { connection: { include: {
      accounts: true, consents: { where: { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } },
    } } } });
    if (event.processingStatus === "DONE") return;
    if (event.connection.status !== "ACTIVE") throw new Error("Connection is paused or revoked.");
    const decrypted = JSON.parse(openBankEvent(event.payloadCiphertext).toString("utf8"));
    const envelope = bankEnvelope.parse(decrypted.envelope ?? decrypted);
    if (!bankConsentAllowsAccount(event.connection.consents, event.providerCode, envelope.accountRef) ||
        (event.connection.consentExpiresAt && event.connection.consentExpiresAt <= new Date())) {
      throw new Error("Bank sync consent is revoked or expired.");
    }
    const account = event.connection.accounts.find(a => a.providerAccountRef === envelope.accountRef && a.status === "ACTIVE");
    if (!account || account.currency !== "VND") throw new Error("Bank account is not mapped in the verified connection.");
    for (const row of envelope.transactions) {
      const fingerprint = bankFingerprint(account.id, row);
      const existing = row.externalTransactionId ? await db.bankTransaction.findUnique({
        where: { bankAccountId_externalTransactionId: { bankAccountId: account.id, externalTransactionId: row.externalTransactionId } },
      }) : null;
      if (existing && (existing.amount.toString() !== row.amount || existing.direction !== row.direction ||
          existing.currency !== row.currency || existing.occurredAt.getTime() !== new Date(row.occurredAt).getTime())) {
        await db.bankReviewItem.upsert({ where: { bankTransactionId_reasonCode: { bankTransactionId: existing.id, reasonCode: "SOURCE_CONFLICT" } },
          create: { workspaceId: event.workspaceId, bankTransactionId: existing.id, reasonCode: "SOURCE_CONFLICT" }, update: { status: "OPEN" } });
        continue;
      }
      if (existing) {
        // The first raw event remains immutable. Later events update only canonical
        // status and manual review; they never create a second ledger posting.
        const transition = bankBookingTransition(existing.bookingStatus as "PENDING" | "BOOKED" | "REVERSED" | "UNKNOWN", row.bookingStatus);
        if (transition === "BOOKED") {
          await db.bankTransaction.update({ where: { id: existing.id }, data: { bookingStatus: "BOOKED", sourceVersion: row.sourceVersion,
            bookedAt: row.bookedAt ? new Date(row.bookedAt) : new Date(row.occurredAt) } });
          if (existing.processingStatus === "REVIEW_REQUIRED") {
            await db.bankReviewItem.updateMany({ where: { bankTransactionId: existing.id, reasonCode: "NOT_BOOKED", status: "OPEN" },
              data: { status: "RESOLVED", resolvedBy: "SYSTEM", resolvedAt: new Date() } });
            await db.bankReviewItem.upsert({ where: { bankTransactionId_reasonCode: { bankTransactionId: existing.id, reasonCode: "NEEDS_CONFIRMATION" } },
              create: { workspaceId: event.workspaceId, bankTransactionId: existing.id, reasonCode: "NEEDS_CONFIRMATION" }, update: { status: "OPEN" } });
          }
        } else if (transition === "REVERSED") {
          await db.bankTransaction.update({ where: { id: existing.id }, data: { bookingStatus: "REVERSED", sourceVersion: row.sourceVersion } });
          if (existing.processingStatus === "LINKED") {
            await db.bankReviewItem.upsert({ where: { bankTransactionId_reasonCode: { bankTransactionId: existing.id, reasonCode: "REVERSAL_REQUIRED" } },
              create: { workspaceId: event.workspaceId, bankTransactionId: existing.id, reasonCode: "REVERSAL_REQUIRED" }, update: { status: "OPEN" } });
          } else if (existing.processingStatus === "REVIEW_REQUIRED") {
            await db.bankReviewItem.updateMany({ where: { bankTransactionId: existing.id, reasonCode: { in: ["NEEDS_CONFIRMATION", "NOT_BOOKED"] }, status: "OPEN" },
              data: { status: "RESOLVED", resolvedBy: "SYSTEM", resolvedAt: new Date() } });
            await db.bankReviewItem.upsert({ where: { bankTransactionId_reasonCode: { bankTransactionId: existing.id, reasonCode: "NOT_BOOKED" } },
              create: { workspaceId: event.workspaceId, bankTransactionId: existing.id, reasonCode: "NOT_BOOKED" }, update: { status: "OPEN" } });
          }
        } else if (transition === "PENDING") {
          await db.bankTransaction.update({ where: { id: existing.id }, data: { bookingStatus: "PENDING", sourceVersion: row.sourceVersion } });
        } else if (transition === "CONFLICT") {
          await db.bankReviewItem.upsert({ where: { bankTransactionId_reasonCode: { bankTransactionId: existing.id, reasonCode: "SOURCE_CONFLICT" } },
            create: { workspaceId: event.workspaceId, bankTransactionId: existing.id, reasonCode: "SOURCE_CONFLICT" }, update: { status: "OPEN" } });
        }
        continue;
      }
      // A statement can repeat the same bank row in overlapping exports. When the
      // provider gives no stable transaction ID, retain both sources for audit,
      // but flag the later row and never let it produce a second journal.
      const possibleDuplicate = !row.externalTransactionId && await db.bankTransaction.findFirst({
        where: { bankAccountId: account.id, fingerprint }, select: { id: true },
      });
      const canonical = await db.bankTransaction.create({ data: { workspaceId: event.workspaceId, bankAccountId: account.id, rawEventId: event.id,
        externalTransactionId: row.externalTransactionId ?? null, bankReference: row.bankReference ?? null, amount: row.amount, direction: row.direction,
        currency: row.currency, occurredAt: new Date(row.occurredAt), bookedAt: row.bookedAt ? new Date(row.bookedAt) : null,
        descriptionRaw: row.descriptionRaw, runningBalance: row.runningBalance ?? null, bookingStatus: row.bookingStatus,
        fingerprint, sourceVersion: row.sourceVersion, processingStatus: "REVIEW_REQUIRED" } });
      const reasonCode = possibleDuplicate ? "DUPLICATE_CANDIDATE" : row.bookingStatus === "BOOKED" ? "NEEDS_CONFIRMATION" : "NOT_BOOKED";
      await db.bankReviewItem.create({ data: { workspaceId: event.workspaceId, bankTransactionId: canonical.id, reasonCode } });
    }
    await db.bankRawEvent.update({ where: { id }, data: { processingStatus: "DONE", attemptCount: { increment: 1 }, lastError: null } });
  });
}

/** Durable DB-backed queue: claim by CAS, recover expired leases, bounded retries and DLQ. */
export async function processBankOutbox(limit = 20) {
  const now = new Date();
  const candidates = await prisma.bankSyncOutbox.findMany({ where: { eventType: "BANK_EVENT", nextAttemptAt: { lte: now },
    OR: [{ status: { in: ["PENDING", "RETRY"] } }, { status: "PROCESSING", leaseUntil: { lt: now } }] },
    orderBy: { createdAt: "asc" }, take: Math.min(limit, 50) });
  let processed = 0, retried = 0;
  for (const job of candidates) {
    const claimed = await prisma.bankSyncOutbox.updateMany({ where: { id: job.id, status: job.status, retryCount: job.retryCount,
      ...(job.status === "PROCESSING" ? { leaseUntil: { lt: now } } : {}) },
      data: { status: "PROCESSING", leaseUntil: new Date(Date.now() + 60_000) } });
    if (!claimed.count) continue;
    try {
      await processEvent(job.aggregateId);
      await prisma.bankSyncOutbox.update({ where: { id: job.id }, data: { status: "DONE", leaseUntil: null } });
      processed++;
    } catch {
      const attempts = job.retryCount + 1;
      await prisma.bankSyncOutbox.update({ where: { id: job.id }, data: { retryCount: attempts, status: attempts >= 5 ? "DLQ" : "RETRY",
        leaseUntil: null, nextAttemptAt: new Date(Date.now() + Math.min(3600, 2 ** attempts * 30) * 1000) } });
      await prisma.bankRawEvent.update({ where: { id: job.aggregateId }, data: { processingStatus: attempts >= 5 ? "DLQ" : "RETRY", attemptCount: { increment: 1 }, lastError: "Processing failed; inspect restricted logs." } });
      retried++;
    }
  }
  return { processed, retried };
}

/** Explicit, audited operator recovery of one DLQ event. The worker still requires active consent. */
export async function replayBankDeadLetter(workspaceId: string, eventId: string, reasonCode: "SOURCE_RESTORED" | "TRANSIENT_FAILURE" | "OPERATOR_REVIEWED") {
  return serializable(async db => {
    const event = await db.bankRawEvent.findFirst({ where: { id: eventId, workspaceId }, include: {
      connection: { include: { accounts: { where: { status: "ACTIVE" } },
        consents: { where: { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } } } },
    } });
    if (!event) throw new HttpError(404, "EVENT_NOT_FOUND", "Không tìm thấy sự kiện trong workspace.");
    if (event.connection.status !== "ACTIVE" || event.connection.accounts.length === 0 ||
        event.connection.consents.length === 0 ||
        (event.connection.consentExpiresAt && event.connection.consentExpiresAt <= new Date())) {
      throw new HttpError(409, "CONNECTION_INACTIVE", "Nguồn hoặc quyền đồng bộ chưa được khôi phục.");
    }
    if (event.processingStatus !== "DLQ") throw new HttpError(409, "NOT_IN_DLQ", "Sự kiện chưa ở hàng đợi lỗi.");
    // A connection may have another active account after the original account
    // was unlinked. Validate the encrypted source's account before requeueing.
    const decrypted = JSON.parse(openBankEvent(event.payloadCiphertext).toString("utf8"));
    const envelope = bankEnvelope.parse(decrypted.envelope ?? decrypted);
    if (!event.connection.accounts.some(account => account.providerAccountRef === envelope.accountRef && account.currency === "VND") ||
        !bankConsentAllowsAccount(event.connection.consents, event.connection.providerCode, envelope.accountRef)) {
      throw new HttpError(409, "ACCOUNT_UNMAPPED", "Tài khoản nguồn của sự kiện không còn được liên kết.");
    }
    const job = await db.bankSyncOutbox.findUnique({ where: { eventType_aggregateId: { eventType: "BANK_EVENT", aggregateId: eventId } } });
    if (!job || job.status !== "DLQ") throw new HttpError(409, "NOT_IN_DLQ", "Hàng đợi không còn ở trạng thái lỗi.");
    const changed = await db.bankSyncOutbox.updateMany({ where: { id: job.id, status: "DLQ" }, data: {
      status: "PENDING", retryCount: 0, nextAttemptAt: new Date(), leaseUntil: null,
    } });
    if (changed.count !== 1) throw new HttpError(409, "REPLAY_CONFLICT", "Sự kiện đang được xử lý.");
    await db.bankRawEvent.update({ where: { id: event.id }, data: { processingStatus: "PENDING", lastError: null } });
    await db.bankAuditEvent.create({ data: { workspaceId, actorType: "SYSTEM", actorId: "BANK_REPLAY_OPERATOR",
      action: "DLQ_REPLAY_REQUESTED", resourceType: "RAW_EVENT", resourceId: event.id,
      metadataRedactedJson: { reasonCode, priorRetryCount: job.retryCount },
    } });
    return { eventId: event.id, status: "PENDING" as const };
  });
}

export async function listBankReviews(workspaceId: string) {
  const reviews = await prisma.bankReviewItem.findMany({ where: { workspaceId, status: "OPEN" }, include: {
    bankTransaction: { include: { account: { select: { accountMasked: true, walletId: true, connection: { select: { providerCode: true, cutoverAt: true } } } } } },
  }, orderBy: { createdAt: "desc" }, take: 100 });
  return reviews.map(r => ({ id: r.id, reasonCode: r.reasonCode, bankTransactionId: r.bankTransaction.id,
    description: r.bankTransaction.descriptionRaw, amount: r.bankTransaction.amount.toFixed(0), direction: r.bankTransaction.direction,
    bookingStatus: r.bankTransaction.bookingStatus, occurredAt: r.bankTransaction.occurredAt,
    walletId: r.bankTransaction.account.walletId, accountMasked: r.bankTransaction.account.accountMasked,
    providerCode: r.bankTransaction.account.connection.providerCode,
    beforeCutover: !!(r.bankTransaction.account.connection.cutoverAt && r.bankTransaction.occurredAt < r.bankTransaction.account.connection.cutoverAt) }));
}

const reviewDecision = z.discriminatedUnion("action", [
  z.object({ action: z.literal("POST"), categoryId: z.string().min(1) }).strict(),
  z.object({ action: z.literal("TRANSFER"), otherWalletId: z.string().min(1) }).strict(),
  z.object({ action: z.literal("LINK"), transactionId: z.string().min(1) }).strict(),
  z.object({ action: z.literal("IGNORE") }).strict(),
]);

/** User confirmation is the only ledger entry point for sandbox/import feeds. */
export async function resolveBankReview(context: UserContext, reviewId: string, raw: unknown) {
  const decision = reviewDecision.parse(raw);
  return serializable(async db => {
    const review = await db.bankReviewItem.findFirst({ where: { id: reviewId, workspaceId: context.workspaceId, status: "OPEN" },
      include: { bankTransaction: { include: { account: { include: { connection: true } }, links: true } } } });
    if (!review) throw new HttpError(404, "REVIEW_NOT_FOUND", "Không tìm thấy mục cần xác nhận.");
    const source = review.bankTransaction;
    const walletId = source.account.walletId;
    if (!walletId) throw new HttpError(422, "WALLET_NOT_LINKED", "Chưa liên kết ví.");
    if (source.links.length > 0 || source.processingStatus !== "REVIEW_REQUIRED") {
      throw new HttpError(409, "ALREADY_RESOLVED", "Dòng sao kê đã được xử lý.");
    }
    if (["SOURCE_CONFLICT", "REVERSAL_REQUIRED"].includes(review.reasonCode)) {
      throw new HttpError(422, "MANUAL_RECONCILIATION_REQUIRED", "Dữ liệu đã thay đổi, cần tra soát nguồn trước khi ghi sổ.");
    }
    if (decision.action !== "IGNORE" && source.bookingStatus !== "BOOKED") {
      throw new HttpError(422, "NOT_BOOKED", "Chỉ ghi nhận giao dịch ngân hàng đã BOOKED.");
    }
    if ((decision.action === "POST" || decision.action === "TRANSFER") && source.account.connection.cutoverAt &&
      source.occurredAt < source.account.connection.cutoverAt) {
      throw new HttpError(422, "CUTOVER_REVIEW", "Giao dịch trước mốc liên kết ví cần đối chiếu với giao dịch cũ hoặc bỏ qua.");
    }
    if ((decision.action === "POST" || decision.action === "TRANSFER") && !source.externalTransactionId) {
      const previouslyPosted = await db.bankTransaction.findFirst({ where: {
        bankAccountId: source.bankAccountId, fingerprint: source.fingerprint, id: { not: source.id },
        links: { some: {} },
      }, select: { id: true } });
      if (previouslyPosted) throw new HttpError(409, "POSSIBLE_SOURCE_DUPLICATE",
        "Một dòng sao kê giống hệt đã liên kết sổ cái. Hãy tra soát hoặc liên kết giao dịch hiện có.");
    }
    // Claim the source as part of the serializable ledger transaction. All other
    // review reasons for this same row are closed in the same atomic commit.
    const claim = await db.bankTransaction.updateMany({ where: { id: source.id, workspaceId: context.workspaceId,
      processingStatus: "REVIEW_REQUIRED" }, data: { processingStatus: "RESOLVING" } });
    if (claim.count !== 1) throw new HttpError(409, "ALREADY_RESOLVED", "Dòng sao kê đã được xử lý.");
    const kind = source.direction === "IN" ? "INCOME" : "EXPENSE";
    const occurredAt = (source.bookedAt ?? source.occurredAt).toISOString();
    let transactionId: string | undefined;
    if (decision.action === "LINK") {
      const existing = await db.transaction.findFirst({ where: { id: decision.transactionId, workspaceId: context.workspaceId, status: "ACTIVE" } });
      if (!existing || !existing.amount.eq(source.amount) ||
        !(existing.kind === kind && existing.walletId === walletId || existing.kind === "TRANSFER" &&
          (source.direction === "IN" ? existing.destinationWalletId === walletId : existing.walletId === walletId)) ||
        Math.abs(existing.occurredAt.getTime() - source.occurredAt.getTime()) > 72 * 3600 * 1000) {
        throw new HttpError(422, "MATCH_INVALID", "Giao dịch chọn liên kết không khớp số tiền, ví, hướng hoặc thời gian.");
      }
      const sameSide = await db.bankTransactionLink.findFirst({ where: { workspaceId: context.workspaceId,
        transactionId: existing.id, bankTransaction: { direction: source.direction, account: { walletId } } }, select: { id: true } });
      if (sameSide) throw new HttpError(409, "TRANSFER_SIDE_ALREADY_LINKED", "Vế giao dịch này đã có chứng từ ngân hàng.");
      transactionId = existing.id;
    } else if (decision.action === "POST" || decision.action === "TRANSFER") {
      const amount = source.amount.toFixed(0);
      const candidates = await db.transaction.count({ where: { workspaceId: context.workspaceId, status: "ACTIVE", amount,
        OR: [{ walletId }, { destinationWalletId: walletId }],
        occurredAt: { gte: new Date(source.occurredAt.getTime() - 72 * 3600 * 1000), lte: new Date(source.occurredAt.getTime() + 72 * 3600 * 1000) } } });
      if (candidates) throw new HttpError(409, "POSSIBLE_DUPLICATE", "Có giao dịch cùng ví/số tiền gần thời điểm này. Hãy kiểm tra và chọn liên kết nếu trùng.");
      let input: Parameters<typeof createTransactionInDb>[2];
      if (decision.action === "POST") {
        input = { kind, walletId, categoryId: decision.categoryId, amount, occurredAt, note: source.descriptionRaw };
      } else {
        if (decision.otherWalletId === walletId) throw new HttpError(422, "INVALID_TRANSFER", "Ví nguồn và ví đích phải khác nhau.");
        input = { kind: "TRANSFER", walletId: source.direction === "OUT" ? walletId : decision.otherWalletId,
          destinationWalletId: source.direction === "IN" ? walletId : decision.otherWalletId, amount, occurredAt, note: source.descriptionRaw };
      }
      const tx = await createTransactionInDb(db, context, input, `bank-sync:${source.id}:v1`);
      transactionId = tx.id;
    }
    if (transactionId) {
      await db.bankTransactionLink.create({ data: { workspaceId: context.workspaceId, bankTransactionId: source.id, transactionId,
        linkType: decision.action === "LINK" ? "MATCHED_MANUAL" : "POSTED", createdBy: context.userId } });
    }
    await db.bankTransaction.update({ where: { id: source.id }, data: { processingStatus: decision.action === "IGNORE" ? "IGNORED" : "LINKED" } });
    await db.bankReviewItem.updateMany({ where: { workspaceId: context.workspaceId, bankTransactionId: source.id, status: "OPEN" },
      data: { status: "RESOLVED", resolvedBy: context.userId, resolvedAt: new Date() } });
    await db.bankAuditEvent.create({ data: { workspaceId: context.workspaceId, actorType: "USER", actorId: context.userId,
      action: decision.action, resourceType: "BANK_TRANSACTION", resourceId: source.id, metadataRedactedJson: { linked: !!transactionId } } });
    return { action: decision.action, transactionId: transactionId ?? null };
  });
}

/** Imported statements are first staged; never directly posted into journals. */
export async function importBankStatement(context: UserContext, file: File, mapping: StatementMapping, expectedHash: string, expectedPreviewToken: string) {
  const preview = await readBankStatement(file, mapping);
  if (preview.fileHash !== expectedHash) throw new HttpError(409, "FILE_CHANGED", "Tệp đã thay đổi sau khi xem trước.");
  if (preview.previewToken !== expectedPreviewToken) throw new HttpError(409, "MAPPING_CHANGED", "Ánh xạ đã thay đổi sau khi xem trước; vui lòng xem trước lại.");
  if (!preview.validCount) throw new HttpError(422, "NO_VALID_ROWS", "Không có dòng hợp lệ để nhập.");
  const connection = await serializable(async db => {
    const wallet = await db.wallet.findFirst({ where: { id: mapping.walletId, workspaceId: context.workspaceId,
      type: "BANK", currency: "VND", archivedAt: null } });
    if (!wallet) throw new HttpError(422, "INVALID_WALLET", "Cần chọn ví ngân hàng VND đang hoạt động.");
    await db.bankProvider.upsert({ where: { code: "STATEMENT_IMPORT" },
      create: { code: "STATEMENT_IMPORT", displayName: "Sao kê do người dùng tải lên", status: "IMPORT_ONLY", capabilitiesJson: providerCapabilities.STATEMENT_IMPORT }, update: {} });
    const existing = await db.bankConnection.findFirst({ where: { workspaceId: context.workspaceId, providerCode: "STATEMENT_IMPORT",
      status: { not: "REVOKED" }, accounts: { some: { walletId: mapping.walletId, status: "ACTIVE" } } }, include: { accounts: true } });
    if (existing) {
      if (existing.cutoverAt?.getTime() !== preview.cutoverAt.getTime()) throw new HttpError(409, "CUTOVER_CONFLICT", "Mốc bắt đầu đã cố định cho ví này; hãy dùng lại mốc của đợt nhập trước.");
      if (existing.status !== "ACTIVE") throw new HttpError(409, "CONNECTION_PAUSED", "Nguồn nhập này đã bị tạm dừng.");
      return { id: existing.id, accountRef: existing.accounts[0].providerAccountRef };
    }
    const mapped = await db.bankAccount.findFirst({ where: { workspaceId: context.workspaceId, walletId: mapping.walletId,
      status: "ACTIVE" }, select: { id: true } });
    if (mapped) throw new HttpError(409, "WALLET_ALREADY_LINKED", "Ví đã được ánh xạ với nguồn sao kê khác.");
    const created = await db.bankConnection.create({ data: { workspaceId: context.workspaceId, providerCode: "STATEMENT_IMPORT",
      status: "ACTIVE", postingPolicy: "REVIEW_FIRST", cutoverAt: preview.cutoverAt } });
    await db.bankConsent.create({ data: { workspaceId: context.workspaceId, connectionId: created.id,
      scopeJson: { importedStatement: true }, purposeVersion: "user-upload-v1", evidenceRef: `file:${preview.fileHash}`, grantedAt: new Date() } });
    const account = await db.bankAccount.create({ data: { workspaceId: context.workspaceId, connectionId: created.id,
      providerAccountRef: `import-wallet-${mapping.walletId}`, accountMasked: "•••• TỆP SAO KÊ", walletId: mapping.walletId } });
    return { id: created.id, accountRef: account.providerAccountRef };
  });
  let staged = 0, duplicate = 0;
  for (const row of preview.rows) {
    if (!row.transaction) continue;
    const envelope = statementEnvelope(preview.fileHash, mapping.walletId, row, connection.accountRef);
    const raw = Buffer.from(JSON.stringify(envelope), "utf8");
    const result = await persistBankEnvelope("STATEMENT_IMPORT", connection.id, envelope, raw);
    if (result.duplicate) duplicate++;
    else staged++;
  }
  await prisma.bankAuditEvent.create({ data: { workspaceId: context.workspaceId, actorType: "USER", actorId: context.userId,
    action: "STATEMENT_IMPORT", resourceType: "CONNECTION", resourceId: connection.id,
    metadataRedactedJson: { staged, duplicate, invalid: preview.invalidCount, fileHash: preview.fileHash } } });
  return { staged, duplicate, invalid: preview.invalidCount, total: preview.total,
    message: "Đã đưa dòng hợp lệ vào hàng đợi. Giao dịch phải được xác nhận trước khi ghi sổ." };
}
