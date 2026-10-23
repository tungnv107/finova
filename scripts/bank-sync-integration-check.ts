/** PostgreSQL-only Bank Sync integrity tests, isolated to a local finova_test DB. */
import assert from "node:assert/strict";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { prisma } from "../src/lib/db";
import { seedCategories } from "../src/server/seed-categories";
import { createWallet } from "../src/server/ledger";
import { bootstrapPersonalWorkspace } from "../src/server/bootstrap";
import { auth } from "../src/server/auth";
import { configuredAppOrigin } from "../src/server/origin";
import { auditLedger } from "./reconcile-ledger";
import { cleanupBankSyncFixture } from "./bank-sync-fixture-cleanup";
import { openBankEvent, providerCapabilities, type BankEnvelope } from "../src/modules/bank-sync/domain";
import { persistBankEnvelope, processBankOutbox, resolveBankReview } from "../src/modules/bank-sync/service";
import { attachSePayAccount, availableSePayAccounts, syncSePayHistory } from "../src/modules/bank-sync/sepay/service";
import { POST as receiveSePayIpn } from "../src/app/api/webhooks/sepay-bankhub/ipn/route";
import { POST as manualSePaySync } from "../src/app/api/v1/bank-sync/connections/[id]/sync/route";
import { POST as replayDeadLetter } from "../src/app/api/internal/bank-sync/replay/route";

const stamp = "2026-10-22T10:00:00+07:00";

function requireTestDatabase() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (process.env.FINOVA_TEST_RUN !== "1" || process.env.NODE_ENV === "production" ||
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.pathname !== "/finova_test") {
    throw new Error("Bank Sync integration requires FINOVA_TEST_RUN=1 and the local finova_test database.");
  }
  if (Buffer.from(process.env.FINOVA_BANK_EVENT_KEY ?? "", "base64").length !== 32) {
    throw new Error("The test requires a valid FINOVA_BANK_EVENT_KEY (32 bytes).");
  }
}

function envelope(eventId: string, accountRef: string, externalId: string, amount = "12500", direction: "IN" | "OUT" = "IN", bookingStatus: "BOOKED" | "PENDING" | "REVERSED" = "BOOKED"): BankEnvelope {
  return { eventId, accountRef, transactions: [{ externalTransactionId: externalId,
    amount, direction, currency: "VND", occurredAt: stamp, bookedAt: bookingStatus === "BOOKED" ? stamp : null,
    bookingStatus, descriptionRaw: `Synthetic ${externalId}`, sourceVersion: "1" }] };
}

function raw(value: BankEnvelope) { return Buffer.from(JSON.stringify(value)); }

async function main() {
  requireTestDatabase();
  // The operator replay endpoint uses a global, one-minute quota. Clear only
  // that quota in the dedicated test DB so back-to-back fixture runs are stable.
  const testReplayQuotaKey = createHash("sha256").update("scheduler:finova-internal-bank-replay").digest("hex");
  const workspaceIds: string[] = [];
  const userIds: string[] = [];
  let checks = 0;
  const ok = (message: string) => { checks++; console.log(`PASS ${checks}: ${message}`); };
  try {
    await prisma.$connect();
    await prisma.apiRateLimit.deleteMany({ where: { key: testReplayQuotaKey } });
    const pending = await prisma.bankSyncOutbox.count({ where: { status: { in: ["PENDING", "RETRY", "PROCESSING"] } } });
    assert.equal(pending, 0, "Refusing to run the global outbox worker while unrelated events are pending.");
    async function setup(name: string) {
      const userId = `integration-${randomUUID()}`;
      const workspaceId = `integration-${randomUUID()}`;
      await prisma.user.create({ data: { id: userId, name: "Finova Integration", email: `${userId}@example.invalid` } });
      userIds.push(userId);
      await prisma.workspace.create({ data: { id: workspaceId, name: "Integration test", createdById: userId,
        memberships: { create: { userId } } } });
      workspaceIds.push(workspaceId);
      await seedCategories(workspaceId);
      const context = { userId, workspaceId, name, image: null };
      const wallet = await createWallet(context, { name: `${name} bank`, type: "BANK", openingBalance: "0", openingDate: stamp });
      return { context, wallet };
    }
    const a = await setup("A");
    const b = await setup("B");
    const otherWallet = await createWallet(a.context, { name: "A destination", type: "BANK", openingBalance: "0", openingDate: stamp });
    await prisma.bankProvider.upsert({ where: { code: "SEPAY_BANKHUB" }, create: {
      code: "SEPAY_BANKHUB", displayName: "SePay Bank Hub", status: "SANDBOX", capabilitiesJson: providerCapabilities.SEPAY_BANKHUB,
    }, update: {} });
    async function connection(workspaceId: string, walletId: string, accountRef: string) {
      const connected = await prisma.bankConnection.create({ data: { workspaceId, providerCode: "SEPAY_BANKHUB", status: "ACTIVE",
        postingPolicy: "REVIEW_FIRST", cutoverAt: new Date("2026-10-01T00:00:00+07:00") } });
      const account = await prisma.bankAccount.create({ data: { workspaceId, connectionId: connected.id,
        providerAccountRef: accountRef, accountMasked: "**** TEST", walletId } });
      await prisma.bankConsent.create({ data: { workspaceId, connectionId: connected.id,
        scopeJson: { transactions: true, bankAccountXid: accountRef },
        purposeVersion: "synthetic-integration-v1", evidenceRef: "synthetic-only", grantedAt: new Date() } });
      return { connectionId: connected.id, account };
    }
    const aSource = await connection(a.context.workspaceId, a.wallet.id, `source-${randomUUID()}`);
    const bSource = await connection(b.context.workspaceId, b.wallet.id, `source-${randomUUID()}`);
    const aDestination = await connection(a.context.workspaceId, otherWallet.id, `destination-${randomUUID()}`);

    // Mock only the partner HTTP boundary; exercise the real Serializable database
    // transaction, workspace FK and unique active-wallet constraints below.
    const linkWallet = await createWallet(a.context, { name: "SePay link fixture", type: "BANK",
      openingBalance: "0", openingDate: stamp });
    const partnerCompany = `synthetic-company-${randomUUID()}`;
    const partnerAccount = `synthetic-account-${randomUUID()}`;
    const partnerConnection = await prisma.bankConnection.create({ data: {
      workspaceId: a.context.workspaceId, providerCode: "SEPAY_BANKHUB", status: "PAUSED",
      providerConnectionRef: partnerCompany, postingPolicy: "REVIEW_FIRST",
    } });
    const priorFetch = globalThis.fetch;
    const partnerEnv = {
      enabled: process.env.FINOVA_SEPAY_BANKHUB_ENABLED,
      id: process.env.FINOVA_SEPAY_BANKHUB_CLIENT_ID,
      secret: process.env.FINOVA_SEPAY_BANKHUB_CLIENT_SECRET,
    };
    let injectWrongCompany = false;
    process.env.FINOVA_SEPAY_BANKHUB_ENABLED = "1";
    process.env.FINOVA_SEPAY_BANKHUB_CLIENT_ID = "synthetic-client";
    process.env.FINOVA_SEPAY_BANKHUB_CLIENT_SECRET = "synthetic-secret";
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/token")) return new Response(JSON.stringify({ access_token: "synthetic-token", ttl: 600 }), { status: 201 });
      assert.equal(url.pathname.endsWith("/bank-account"), true);
      assert.equal(url.searchParams.get("company_xid"), partnerCompany);
      return new Response(JSON.stringify({ data: [{ xid: partnerAccount,
        company_xid: injectWrongCompany ? "foreign-company" : partnerCompany,
        account_number: "00001234", active: "1" }], meta: { has_more: false } }), { status: 200 });
    }) as typeof fetch;
    try {
      await assert.rejects(availableSePayAccounts(b.context, partnerConnection.id),
        (error: unknown) => error instanceof Error && "code" in error && error.code === "SEPAY_CONNECTION_MISSING");
      injectWrongCompany = true;
      await assert.rejects(availableSePayAccounts(a.context, partnerConnection.id),
        (error: unknown) => error instanceof Error && "code" in error && error.code === "SEPAY_TENANT_MISMATCH");
      await assert.rejects(attachSePayAccount(a.context, partnerConnection.id, partnerAccount, linkWallet.id, true));
      injectWrongCompany = false;
      const offered = await availableSePayAccounts(a.context, partnerConnection.id);
      assert.deepEqual(offered.map(row => row.accountMasked), ["•••• 1234"]);
      const attempted = await Promise.allSettled(Array.from({ length: 2 }, () =>
        attachSePayAccount(a.context, partnerConnection.id, partnerAccount, linkWallet.id, true)));
      assert.equal(attempted.filter(result => result.status === "fulfilled").length, 1);
      assert.equal(await prisma.bankAccount.count({ where: { connectionId: partnerConnection.id, status: "ACTIVE" } }), 1);
      assert.equal(await prisma.bankConsent.count({ where: { connectionId: partnerConnection.id, revokedAt: null } }), 1);
      const linked = await prisma.bankAccount.findFirstOrThrow({ where: {
        connectionId: partnerConnection.id, providerAccountRef: partnerAccount }, select: { id: true, walletId: true } });
      assert.equal(linked.walletId, linkWallet.id);
      assert.equal(await prisma.bankAuditEvent.count({ where: { resourceId: linked.id,
        workspaceId: a.context.workspaceId, action: "SEPAY_ACCOUNT_LINKED" } }), 1);
      assert.equal((await prisma.bankConnection.findUniqueOrThrow({ where: { id: partnerConnection.id } })).status, "ACTIVE");
      ok("SePay company ownership, masked listing, and concurrent wallet claims enforced in PostgreSQL");
    } finally {
      globalThis.fetch = priorFetch;
      if (partnerEnv.enabled === undefined) delete process.env.FINOVA_SEPAY_BANKHUB_ENABLED;
      else process.env.FINOVA_SEPAY_BANKHUB_ENABLED = partnerEnv.enabled;
      if (partnerEnv.id === undefined) delete process.env.FINOVA_SEPAY_BANKHUB_CLIENT_ID;
      else process.env.FINOVA_SEPAY_BANKHUB_CLIENT_ID = partnerEnv.id;
      if (partnerEnv.secret === undefined) delete process.env.FINOVA_SEPAY_BANKHUB_CLIENT_SECRET;
      else process.env.FINOVA_SEPAY_BANKHUB_CLIENT_SECRET = partnerEnv.secret;
    }

    await assert.rejects(prisma.bankAccount.create({ data: { workspaceId: a.context.workspaceId,
      connectionId: bSource.connectionId, providerAccountRef: "foreign-connection", accountMasked: "****", walletId: a.wallet.id } }));
    await assert.rejects(prisma.bankAccount.create({ data: { workspaceId: a.context.workspaceId,
      connectionId: aSource.connectionId, providerAccountRef: "duplicate-wallet", accountMasked: "****", walletId: a.wallet.id } }));
    await assert.rejects(persistBankEnvelope("SEPAY_BANKHUB", aSource.connectionId,
      envelope("foreign", bSource.account.providerAccountRef, "cross-tenant"), raw(envelope("foreign", bSource.account.providerAccountRef, "cross-tenant"))));
    ok("composite workspace FKs, unique active wallet mapping, and account authorization");

    const event = envelope(`ipn:${randomUUID()}`, aSource.account.providerAccountRef, "same-tx");
    const results = await Promise.all(Array.from({ length: 8 }, () => persistBankEnvelope("SEPAY_BANKHUB", aSource.connectionId, event, raw(event))));
    assert.equal(new Set(results.map(result => result.id)).size, 1);
    const saved = await prisma.bankRawEvent.findUniqueOrThrow({ where: { id: results[0].id } });
    assert.equal(saved.deliveryCount, 8);
    assert.equal(await prisma.bankSyncOutbox.count({ where: { aggregateId: saved.id } }), 1);
    assert.notEqual(saved.payloadCiphertext, raw(event).toString("utf8"));
    assert.deepEqual(JSON.parse(openBankEvent(saved.payloadCiphertext).toString("utf8")), event);
    await assert.rejects(persistBankEnvelope("SEPAY_BANKHUB", aSource.connectionId, { ...event,
      transactions: [{ ...event.transactions[0], amount: "12501" }] }, Buffer.from("conflicting-event")));
    ok("concurrent duplicate delivery, payload conflict, encrypted inbox and atomic outbox");

    const [workerA, workerB] = await Promise.all([processBankOutbox(20), processBankOutbox(20)]);
    assert.equal(workerA.processed + workerB.processed, 1);
    assert.equal(await prisma.bankTransaction.count({ where: { workspaceId: a.context.workspaceId } }), 1);
    assert.equal(await prisma.bankReviewItem.count({ where: { workspaceId: a.context.workspaceId } }), 1);
    assert.equal(await prisma.journal.count({ where: { workspaceId: a.context.workspaceId, kind: { not: "OPENING_BALANCE" } } }), 0);
    ok("two workers consume one event and leave the ledger untouched before review");

    const history = envelope(`history:${randomUUID()}`, aSource.account.providerAccountRef, "same-tx");
    await persistBankEnvelope("SEPAY_BANKHUB", aSource.connectionId, history, raw(history));
    await processBankOutbox();
    assert.equal(await prisma.bankTransaction.count({ where: { workspaceId: a.context.workspaceId } }), 1);
    const review = await prisma.bankReviewItem.findFirstOrThrow({ where: { workspaceId: a.context.workspaceId, status: "OPEN" } });
    await assert.rejects(resolveBankReview(b.context, review.id, { action: "IGNORE" }));
    const category = await prisma.category.findFirstOrThrow({ where: { workspaceId: a.context.workspaceId, kind: "INCOME" } });
    const decisions = await Promise.allSettled(Array.from({ length: 2 }, () => resolveBankReview(a.context, review.id, { action: "POST", categoryId: category.id })));
    assert.equal(decisions.filter(row => row.status === "fulfilled").length, 1);
    assert.equal(await prisma.bankTransactionLink.count({ where: { workspaceId: a.context.workspaceId } }), 1);
    assert.equal(await prisma.transaction.count({ where: { workspaceId: a.context.workspaceId, kind: "INCOME" } }), 1);
    // Real PostgreSQL ingestion through a mocked Bank Hub history boundary:
    // paged rows -> durable inbox -> review, repeat overlap -> zero new rows.
    async function verifyPartnerHistory() {
    const originalFetch = globalThis.fetch;
    const historyEnv = {
      enabled: process.env.FINOVA_SEPAY_BANKHUB_ENABLED,
      id: process.env.FINOVA_SEPAY_BANKHUB_CLIENT_ID,
      secret: process.env.FINOVA_SEPAY_BANKHUB_CLIENT_SECRET,
    };
    let failureMode: "none" | "rateLimit" | "secondPageUnavailable" | "secondPageTimeout" |
      "tokenRefresh" | "tokenRejected" | "stress" | "overLimit" = "none";
    let partnerSibling: string | null = null;
    let tokenCalls = 0;
    let expiredOnPageTwo = false;
    let holdFirstPage = false;
    let notifyFirstPage: (() => void) | undefined;
    let releaseFirstPage: (() => void) | undefined;
    let firstPageEntered = Promise.resolve();
    let firstPageReleased = Promise.resolve();
    function pauseNextFirstPage() {
      holdFirstPage = true;
      firstPageEntered = new Promise<void>(resolve => { notifyFirstPage = resolve; });
      firstPageReleased = new Promise<void>(resolve => { releaseFirstPage = resolve; });
    }
    process.env.FINOVA_SEPAY_BANKHUB_ENABLED = "1";
    process.env.FINOVA_SEPAY_BANKHUB_CLIENT_ID = "synthetic-client";
    process.env.FINOVA_SEPAY_BANKHUB_CLIENT_SECRET = "synthetic-secret";
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/token")) {
        tokenCalls++;
        return new Response(JSON.stringify({ access_token: `synthetic-token-${tokenCalls}`, ttl: 600 }), { status: 201 });
      }
      assert.equal(url.pathname.endsWith("/transaction"), true);
      assert.equal(url.searchParams.get("company_xid"), partnerCompany);
      const requestedAccount = url.searchParams.get("bank_account_xid");
      assert.ok(requestedAccount === partnerAccount || requestedAccount === partnerSibling);
      assert.equal(url.searchParams.get("per_page"), "50");
      const page = Number(url.searchParams.get("page"));
      assert.ok(page >= 1 && page <= (["stress", "overLimit"].includes(failureMode) ? 20 : 2));
      if (requestedAccount === partnerSibling) return new Response(JSON.stringify({ data: [],
        meta: { page, total_pages: 1 } }), { status: 200 });
      if (page === 1 && holdFirstPage) {
        holdFirstPage = false;
        notifyFirstPage?.();
        await firstPageReleased;
      }
      if (failureMode === "rateLimit") return new Response(JSON.stringify({ message: "Synthetic rate limit" }), { status: 429 });
      if (page === 2 && failureMode === "tokenRefresh" && !expiredOnPageTwo) {
        expiredOnPageTwo = true;
        return new Response(JSON.stringify({ message: "Synthetic expired token" }), { status: 401 });
      }
      if (page === 2 && failureMode === "tokenRejected") {
        return new Response(JSON.stringify({ message: "Synthetic repeated token rejection" }), { status: 401 });
      }
      if (page === 2 && failureMode === "tokenRefresh") {
        assert.equal((init?.headers as Record<string, string>)?.Authorization, `Bearer synthetic-token-${tokenCalls}`);
      }
      if (page === 2 && failureMode === "secondPageUnavailable") {
        return new Response(JSON.stringify({ message: "Synthetic upstream outage" }), { status: 503 });
      }
      if (page === 2 && failureMode === "secondPageTimeout") throw new Error("Synthetic timeout on history page 2");
      const rows = Array.from({ length: failureMode === "stress" ? 10 : 1 }, (_, index) => ({
        transaction_id: failureMode === "stress" ? `history-stress-${page}-${index}` : `history-${page}`,
        transaction_date: "2026-10-22 10:00:00", company_xid: partnerCompany,
        bank_account_xid: partnerAccount, transfer_type: page === 1 ? "credit" : "debit",
        amount: 4321 * page, transaction_content: "Synthetic history", reference_number: `REF-${page}-${index}` }));
      return new Response(JSON.stringify({ data: rows,
        meta: { page, total_pages: failureMode === "overLimit" ? 21 : failureMode === "stress" ? 20 : 2 } }), { status: 200 });
    }) as typeof fetch;
    try {
      const journalsBefore = await prisma.journal.count({ where: { workspaceId: a.context.workspaceId } });
      const first = await syncSePayHistory(a.context, partnerConnection.id, "2026-10-21", "2026-10-22");
      assert.deepEqual({ accepted: first.accepted, duplicates: first.duplicates }, { accepted: 2, duplicates: 0 });
      const second = await syncSePayHistory(a.context, partnerConnection.id, "2026-10-21", "2026-10-22");
      assert.deepEqual({ accepted: second.accepted, duplicates: second.duplicates }, { accepted: 0, duplicates: 2 });
      assert.equal((await processBankOutbox(20)).processed, 2);
      assert.equal(await prisma.bankTransaction.count({ where: { workspaceId: a.context.workspaceId,
        bankAccountId: { in: (await prisma.bankAccount.findMany({ where: { connectionId: partnerConnection.id },
          select: { id: true } })).map(row => row.id) } } }), 2);
      assert.equal(await prisma.bankReviewItem.count({ where: { workspaceId: a.context.workspaceId,
        bankTransaction: { account: { connectionId: partnerConnection.id } } } }), 2);
      assert.equal(await prisma.journal.count({ where: { workspaceId: a.context.workspaceId } }), journalsBefore);
      ok("SePay 2-page history, overlap dedupe and review-first persistence on PostgreSQL");

      const syncedAt = (await prisma.bankConnection.findUniqueOrThrow({ where: { id: partnerConnection.id } })).lastSyncedAt;
      failureMode = "rateLimit";
      await assert.rejects(syncSePayHistory(a.context, partnerConnection.id, "2026-10-21", "2026-10-22"),
        (error: unknown) => error instanceof Error && "code" in error && error.code === "SEPAY_API_ERROR");
      const failedJob = await prisma.bankSyncJob.findFirstOrThrow({ where: {
        connectionId: partnerConnection.id, status: "FAILED" }, orderBy: { startedAt: "desc" } });
      assert.equal(failedJob.failureReason, "SEPAY_API_ERROR");
      assert.equal((await prisma.bankConnection.findUniqueOrThrow({ where: { id: partnerConnection.id } })).lastSyncedAt?.getTime(), syncedAt?.getTime());
      ok("SePay HTTP 429 produces a failed sync job without advancing lastSyncedAt");

      for (const [mode, reason] of [
        ["secondPageUnavailable", "SEPAY_API_ERROR"],
        ["secondPageTimeout", "SEPAY_UNREACHABLE"],
      ] as const) {
        failureMode = mode;
        await assert.rejects(syncSePayHistory(a.context, partnerConnection.id, "2026-10-21", "2026-10-22"),
          (error: unknown) => error instanceof Error && "code" in error && error.code === reason);
        const failed = await prisma.bankSyncJob.findFirstOrThrow({ where: {
          connectionId: partnerConnection.id, status: "FAILED" }, orderBy: { startedAt: "desc" } });
        assert.equal(failed.failureReason, reason);
        assert.deepEqual(failed.metricsJson, { accepted: 0, duplicates: 1 });
        assert.equal((await prisma.bankConnection.findUniqueOrThrow({ where: { id: partnerConnection.id } })).lastSyncedAt?.getTime(), syncedAt?.getTime());
        assert.equal(await prisma.bankTransaction.count({ where: { account: { connectionId: partnerConnection.id } } }), 2);
        ok(`SePay ${mode} after page 1 fails safely without advancing sync watermark or adding transactions`);
      }

      failureMode = "none";
      const recovered = await syncSePayHistory(a.context, partnerConnection.id, "2026-10-21", "2026-10-22");
      assert.deepEqual({ accepted: recovered.accepted, duplicates: recovered.duplicates }, { accepted: 0, duplicates: 2 });
      assert.equal(await prisma.bankReviewItem.count({ where: { workspaceId: a.context.workspaceId,
        bankTransaction: { account: { connectionId: partnerConnection.id } } } }), 2);
      ok("SePay history recovers after a mid-pagination outage without double-ingesting or posting");

      failureMode = "tokenRefresh";
      const initialTokenCalls = tokenCalls;
      const refreshed = await syncSePayHistory(a.context, partnerConnection.id, "2026-10-21", "2026-10-22");
      assert.deepEqual({ accepted: refreshed.accepted, duplicates: refreshed.duplicates }, { accepted: 0, duplicates: 2 });
      assert.ok(tokenCalls > initialTokenCalls, "HTTP 401 at page 2 must obtain a new token");
      ok("SePay HTTP 401 on page 2 refreshes partner token and dedupes old rows");

      failureMode = "tokenRejected";
      const tokenRejectedWatermark = (await prisma.bankConnection.findUniqueOrThrow({ where: { id: partnerConnection.id } })).lastSyncedAt;
      await assert.rejects(syncSePayHistory(a.context, partnerConnection.id, "2026-10-21", "2026-10-22"),
        (error: unknown) => error instanceof Error && "code" in error && error.code === "SEPAY_AUTH_ERROR");
      assert.equal((await prisma.bankConnection.findUniqueOrThrow({ where: { id: partnerConnection.id } })).lastSyncedAt?.getTime(),
        tokenRejectedWatermark?.getTime());
      ok("Repeated HTTP 401 after Bearer refresh fails closed and preserves sync watermark");

      failureMode = "overLimit";
      await assert.rejects(syncSePayHistory(a.context, partnerConnection.id, "2026-10-21", "2026-10-22"),
        (error: unknown) => error instanceof Error && "code" in error && error.code === "SEPAY_PAGINATION_LIMIT");
      assert.equal((await prisma.bankConnection.findUniqueOrThrow({ where: { id: partnerConnection.id } })).lastSyncedAt?.getTime(),
        tokenRejectedWatermark?.getTime());
      failureMode = "none";
      const afterLimit = await syncSePayHistory(a.context, partnerConnection.id, "2026-10-21", "2026-10-22");
      assert.deepEqual({ accepted: afterLimit.accepted, duplicates: afterLimit.duplicates }, { accepted: 0, duplicates: 2 });
      ok("History exceeding the 20-page limit fails without watermark advancement and can resume safely");

      failureMode = "stress";
      const stress = await syncSePayHistory(a.context, partnerConnection.id, "2026-10-21", "2026-10-22");
      assert.deepEqual({ accepted: stress.accepted, duplicates: stress.duplicates }, { accepted: 200, duplicates: 0 });
      const overlap = await syncSePayHistory(a.context, partnerConnection.id, "2026-10-21", "2026-10-22");
      assert.deepEqual({ accepted: overlap.accepted, duplicates: overlap.duplicates }, { accepted: 0, duplicates: 200 });
      // The rejected 21-page response also left 18 durable (but uncommitted to
      // ledger) page-3..20 rows; a later normal run keeps those for review.
      assert.equal(await prisma.bankRawEvent.count({ where: { connectionId: partnerConnection.id } }), 220);
      const stressEventIds = (await prisma.bankRawEvent.findMany({
        where: { connectionId: partnerConnection.id }, select: { id: true },
      })).map(event => event.id);
      // The durable worker may legitimately retry a transient DB contention
      // error. Advance only this synthetic fixture's retry clock, and require
      // all 220 events to reach DONE; permanent failures still fail the test.
      let pendingStressEvents = -1;
      for (let round = 0; round < 12; round++) {
        await processBankOutbox(50);
        await prisma.bankSyncOutbox.updateMany({ where: {
          eventType: "BANK_EVENT", aggregateId: { in: stressEventIds }, status: "RETRY",
        }, data: { nextAttemptAt: new Date(0) } });
        pendingStressEvents = await prisma.bankSyncOutbox.count({ where: {
          eventType: "BANK_EVENT", aggregateId: { in: stressEventIds }, status: { not: "DONE" },
        } });
        if (!pendingStressEvents) break;
      }
      assert.equal(pendingStressEvents, 0, "All fixture outbox events must eventually complete, including retries");
      assert.equal(await prisma.bankTransaction.count({ where: { account: { connectionId: partnerConnection.id } } }), 220);
      assert.equal(await prisma.journal.count({ where: { workspaceId: a.context.workspaceId } }), journalsBefore);
      ok("SePay 20-page history stress and replay of 200 events preserve unique canonical rows and review-first ledger");

      failureMode = "none";
      pauseNextFirstPage();
      const inProgress = syncSePayHistory(a.context, partnerConnection.id, "2026-10-21", "2026-10-22");
      try {
        await firstPageEntered;
        await assert.rejects(syncSePayHistory(a.context, partnerConnection.id, "2026-10-21", "2026-10-22"),
          (error: unknown) => error instanceof Error && "code" in error && error.code === "SYNC_ALREADY_RUNNING");
        assert.equal(await prisma.bankSyncJob.count({ where: {
          connectionId: partnerConnection.id, type: "SEPAY_HISTORY", status: "RUNNING" } }), 1);
      } finally {
        releaseFirstPage?.();
      }
      const concurrentWinner = await inProgress;
      assert.deepEqual({ accepted: concurrentWinner.accepted, duplicates: concurrentWinner.duplicates }, { accepted: 0, duplicates: 2 });
      ok("SePay history refuses a concurrent job for the same connection and preserves single-worker progress");

      pauseNextFirstPage();
      const staleWorker = syncSePayHistory(a.context, partnerConnection.id, "2026-10-21", "2026-10-22");
      try {
        await firstPageEntered;
        const running = await prisma.bankSyncJob.findFirstOrThrow({ where: { connectionId: partnerConnection.id,
          status: "RUNNING", type: "SEPAY_HISTORY" } });
        await prisma.bankSyncJob.update({ where: { id: running.id }, data: { leaseUntil: new Date(Date.now() - 1000) } });
        const replacement = await syncSePayHistory(a.context, partnerConnection.id, "2026-10-21", "2026-10-22");
        assert.deepEqual({ accepted: replacement.accepted, duplicates: replacement.duplicates }, { accepted: 0, duplicates: 2 });
        const expired = await prisma.bankSyncJob.findUniqueOrThrow({ where: { id: running.id } });
        assert.equal(expired.failureReason, "SYNC_LEASE_EXPIRED");
      } finally { releaseFirstPage?.(); }
      await assert.rejects(staleWorker, (error: unknown) => error instanceof Error && "code" in error && error.code === "SYNC_LEASE_LOST");
      ok("Stale history job is reclaimed after crash lease expiry and late worker cannot finish");

      pauseNextFirstPage();
      const watermarkBeforePause = (await prisma.bankConnection.findUniqueOrThrow({ where: { id: partnerConnection.id } })).lastSyncedAt;
      const pausedWorker = syncSePayHistory(a.context, partnerConnection.id, "2026-10-21", "2026-10-22");
      try {
        await firstPageEntered;
        await prisma.bankConnection.update({ where: { id: partnerConnection.id }, data: { status: "PAUSED" } });
      } finally { releaseFirstPage?.(); }
      await assert.rejects(pausedWorker, (error: unknown) => error instanceof Error && "code" in error && error.code === "CONNECTION_INACTIVE");
      assert.equal((await prisma.bankConnection.findUniqueOrThrow({ where: { id: partnerConnection.id } })).lastSyncedAt?.getTime(), watermarkBeforePause?.getTime());
      await prisma.bankConnection.update({ where: { id: partnerConnection.id }, data: { status: "ACTIVE" } });
      ok("Connection paused during provider I/O prevents late watermark advancement");

      // Two active accounts share a connection, but consent is account-specific.
      // Revoking one account during a fetch must invalidate the whole captured batch.
      const siblingWallet = await createWallet(a.context, { name: "SePay sibling fixture", type: "BANK",
        openingBalance: "0", openingDate: stamp });
      partnerSibling = `synthetic-sibling-${randomUUID()}`;
      await prisma.bankAccount.create({ data: { workspaceId: a.context.workspaceId, connectionId: partnerConnection.id,
        providerAccountRef: partnerSibling, accountMasked: "**** SIBLING", walletId: siblingWallet.id } });
      await prisma.bankConsent.create({ data: { workspaceId: a.context.workspaceId, connectionId: partnerConnection.id,
        scopeJson: { transactions: true, bankAccountXid: partnerSibling },
        purposeVersion: "synthetic-integration-v1", evidenceRef: "synthetic-only", grantedAt: new Date() } });
      const beforeConsentRevoke = (await prisma.bankConnection.findUniqueOrThrow({ where: { id: partnerConnection.id } })).lastSyncedAt;
      pauseNextFirstPage();
      const revokedMidFetch = syncSePayHistory(a.context, partnerConnection.id, "2026-10-21", "2026-10-22");
      try {
        await firstPageEntered;
        await prisma.bankConsent.updateMany({ where: { connectionId: partnerConnection.id, revokedAt: null,
          scopeJson: { path: ["bankAccountXid"], equals: partnerAccount } }, data: { revokedAt: new Date() } });
      } finally { releaseFirstPage?.(); }
      await assert.rejects(revokedMidFetch,
        (error: unknown) => error instanceof Error && "code" in error && error.code === "CONNECTION_INACTIVE");
      assert.equal((await prisma.bankConnection.findUniqueOrThrow({ where: { id: partnerConnection.id } })).lastSyncedAt?.getTime(),
        beforeConsentRevoke?.getTime());
      const unauthorized = envelope(`ipn:${randomUUID()}`, partnerAccount, `revoked-account-${randomUUID()}`);
      await assert.rejects(persistBankEnvelope("SEPAY_BANKHUB", partnerConnection.id, unauthorized, raw(unauthorized)),
        (error: unknown) => error instanceof Error && "code" in error && error.code === "UNAUTHORIZED_BANK_ACCOUNT");
      const authorizedSibling = envelope(`ipn:${randomUUID()}`, partnerSibling, `valid-sibling-${randomUUID()}`);
      await persistBankEnvelope("SEPAY_BANKHUB", partnerConnection.id, authorizedSibling, raw(authorizedSibling));
      assert.equal(await prisma.bankRawEvent.count({ where: { connectionId: partnerConnection.id,
        externalEventId: unauthorized.eventId } }), 0);
      await prisma.bankConsent.updateMany({ where: { connectionId: partnerConnection.id,
        scopeJson: { path: ["bankAccountXid"], equals: partnerAccount } }, data: { revokedAt: null } });
      ok("Account-level consent revocation during history I/O blocks that account despite another active consent");
    } finally {
      globalThis.fetch = originalFetch;
      if (historyEnv.enabled === undefined) delete process.env.FINOVA_SEPAY_BANKHUB_ENABLED;
      else process.env.FINOVA_SEPAY_BANKHUB_ENABLED = historyEnv.enabled;
      if (historyEnv.id === undefined) delete process.env.FINOVA_SEPAY_BANKHUB_CLIENT_ID;
      else process.env.FINOVA_SEPAY_BANKHUB_CLIENT_ID = historyEnv.id;
      if (historyEnv.secret === undefined) delete process.env.FINOVA_SEPAY_BANKHUB_CLIENT_SECRET;
      else process.env.FINOVA_SEPAY_BANKHUB_CLIENT_SECRET = historyEnv.secret;
    }
    }

    assert.equal((await auditLedger(prisma, a.context.workspaceId)).findings.UNBALANCED_JOURNAL.length, 0);
    ok("IPN+history canonical dedupe, tenant review isolation, concurrent posting exactly once");

    const pendingEnvelope = envelope(`ipn:${randomUUID()}`, aSource.account.providerAccountRef, "pending-tx", "990", "IN", "PENDING");
    await persistBankEnvelope("SEPAY_BANKHUB", aSource.connectionId, pendingEnvelope, raw(pendingEnvelope));
    await processBankOutbox();
    const pendingTx = await prisma.bankTransaction.findFirstOrThrow({ where: { bankAccountId: aSource.account.id, externalTransactionId: "pending-tx" } });
    const pendingReview = await prisma.bankReviewItem.findFirstOrThrow({ where: { bankTransactionId: pendingTx.id } });
    await assert.rejects(resolveBankReview(a.context, pendingReview.id, { action: "POST", categoryId: category.id }));
    const bookedEnvelope = envelope(`history:${randomUUID()}`, aSource.account.providerAccountRef, "pending-tx", "990", "IN", "BOOKED");
    await persistBankEnvelope("SEPAY_BANKHUB", aSource.connectionId, bookedEnvelope, raw(bookedEnvelope));
    await processBankOutbox();
    assert.equal((await prisma.bankTransaction.findUniqueOrThrow({ where: { id: pendingTx.id } })).bookingStatus, "BOOKED");
    ok("PENDING cannot be posted and subsequent BOOKED status reopens confirmation");

    const outgoing = envelope(`ipn:${randomUUID()}`, aSource.account.providerAccountRef, "transfer-out", "500", "OUT");
    await persistBankEnvelope("SEPAY_BANKHUB", aSource.connectionId, outgoing, raw(outgoing));
    await processBankOutbox();
    const outRow = await prisma.bankTransaction.findFirstOrThrow({ where: { bankAccountId: aSource.account.id, externalTransactionId: "transfer-out" } });
    const outReview = await prisma.bankReviewItem.findFirstOrThrow({ where: { bankTransactionId: outRow.id } });
    const transfer = await resolveBankReview(a.context, outReview.id, { action: "TRANSFER", otherWalletId: otherWallet.id });
    assert.ok(transfer.transactionId);
    const incoming = envelope(`history:${randomUUID()}`, aDestination.account.providerAccountRef, "transfer-in", "500", "IN");
    await persistBankEnvelope("SEPAY_BANKHUB", aDestination.connectionId, incoming, raw(incoming));
    await processBankOutbox();
    const inRow = await prisma.bankTransaction.findFirstOrThrow({ where: { bankAccountId: aDestination.account.id, externalTransactionId: "transfer-in" } });
    const inReview = await prisma.bankReviewItem.findFirstOrThrow({ where: { bankTransactionId: inRow.id } });
    await resolveBankReview(a.context, inReview.id, { action: "LINK", transactionId: transfer.transactionId });
    assert.equal(await prisma.bankTransactionLink.count({ where: { workspaceId: a.context.workspaceId, transactionId: transfer.transactionId! } }), 2);
    assert.equal(await prisma.transaction.count({ where: { workspaceId: a.context.workspaceId, kind: "TRANSFER" } }), 1);
    const transferJournal = await prisma.journal.findFirstOrThrow({ where: { workspaceId: a.context.workspaceId, transactionId: transfer.transactionId } });
    assert.equal(await prisma.posting.count({ where: { journalId: transferJournal.id } }), 2);
    ok("two bank sides link to one balanced transfer journal");

    const reversed = envelope(`ipn:${randomUUID()}`, aSource.account.providerAccountRef, "same-tx", "12500", "IN", "REVERSED");
    await persistBankEnvelope("SEPAY_BANKHUB", aSource.connectionId, reversed, raw(reversed));
    await processBankOutbox();
    const reversedTx = await prisma.bankTransaction.findFirstOrThrow({ where: { bankAccountId: aSource.account.id, externalTransactionId: "same-tx" } });
    assert.equal(reversedTx.bookingStatus, "REVERSED");
    assert.equal(await prisma.bankReviewItem.count({ where: { bankTransactionId: reversedTx.id, reasonCode: "REVERSAL_REQUIRED", status: "OPEN" } }), 1);
    assert.equal(await prisma.transaction.count({ where: { workspaceId: a.context.workspaceId, kind: "INCOME" } }), 1);
    ok("reversal flags manual reconciliation and cannot silently mutate posted ledger");

    const stale = envelope(`history:${randomUUID()}`, aSource.account.providerAccountRef, "same-tx", "12500", "IN", "PENDING");
    await persistBankEnvelope("SEPAY_BANKHUB", aSource.connectionId, stale, raw(stale));
    await processBankOutbox();
    assert.equal((await prisma.bankTransaction.findUniqueOrThrow({ where: { id: reversedTx.id } })).bookingStatus, "REVERSED");
    const resurrect = envelope(`history:${randomUUID()}`, aSource.account.providerAccountRef, "same-tx", "12500", "IN", "BOOKED");
    await persistBankEnvelope("SEPAY_BANKHUB", aSource.connectionId, resurrect, raw(resurrect));
    await processBankOutbox();
    assert.equal((await prisma.bankTransaction.findUniqueOrThrow({ where: { id: reversedTx.id } })).bookingStatus, "REVERSED");
    assert.equal(await prisma.bankReviewItem.count({ where: { bankTransactionId: reversedTx.id, reasonCode: "SOURCE_CONFLICT" } }), 1);
    ok("stale and resurrected bank statuses cannot silently change a reversed transaction");

    const noId = envelope(`statement:${randomUUID()}`, aSource.account.providerAccountRef, "no-stable-id", "2387");
    noId.transactions[0].externalTransactionId = null;
    await persistBankEnvelope("SEPAY_BANKHUB", aSource.connectionId, noId, raw(noId));
    await processBankOutbox();
    const noIdDuplicate = { ...noId, eventId: `statement:${randomUUID()}` };
    await persistBankEnvelope("SEPAY_BANKHUB", aSource.connectionId, noIdDuplicate, raw(noIdDuplicate));
    await processBankOutbox();
    const sameFingerprint = await prisma.bankTransaction.findMany({ where: { bankAccountId: aSource.account.id,
      externalTransactionId: null, amount: 2387 }, orderBy: { receivedAt: "asc" } });
    assert.equal(sameFingerprint.length, 2);
    assert.equal(await prisma.bankReviewItem.count({ where: {
      bankTransactionId: sameFingerprint[1].id, reasonCode: "DUPLICATE_CANDIDATE" } }), 1);
    const firstReview = await prisma.bankReviewItem.findFirstOrThrow({ where: {
      bankTransactionId: sameFingerprint[0].id, status: "OPEN" } });
    await resolveBankReview(a.context, firstReview.id, { action: "POST", categoryId: category.id });
    const secondReview = await prisma.bankReviewItem.findFirstOrThrow({ where: {
      bankTransactionId: sameFingerprint[1].id, status: "OPEN" } });
    await assert.rejects(resolveBankReview(a.context, secondReview.id, { action: "POST", categoryId: category.id }));
    assert.equal(await prisma.bankTransactionLink.count({ where: { workspaceId: a.context.workspaceId,
      bankTransactionId: { in: sameFingerprint.map(row => row.id) } } }), 1);
    ok("missing stable IDs remain auditable and fingerprint duplicates cannot double-post");

    const leaseEvent = envelope(`ipn:${randomUUID()}`, aDestination.account.providerAccountRef, "expired-lease", "3199");
    const leased = await persistBankEnvelope("SEPAY_BANKHUB", aDestination.connectionId, leaseEvent, raw(leaseEvent));
    await prisma.bankSyncOutbox.update({ where: { eventType_aggregateId: { eventType: "BANK_EVENT", aggregateId: leased.id } },
      data: { status: "PROCESSING", leaseUntil: new Date(Date.now() - 60_000), nextAttemptAt: new Date(Date.now() - 60_000) } });
    const recovered = await Promise.all([processBankOutbox(), processBankOutbox()]);
    assert.equal(recovered.reduce((total, result) => total + result.processed, 0), 1);
    assert.equal(await prisma.bankSyncOutbox.count({ where: { aggregateId: leased.id, status: "DONE" } }), 1);
    assert.equal(await prisma.bankTransaction.count({ where: { bankAccountId: aDestination.account.id, externalTransactionId: "expired-lease" } }), 1);
    ok("expired processing lease is reclaimed once by concurrent workers");

    const poison = envelope(`ipn:${randomUUID()}`, aDestination.account.providerAccountRef, "queue-poison", "3211");
    const poisoned = await persistBankEnvelope("SEPAY_BANKHUB", aDestination.connectionId, poison, raw(poison));
    // A deactivated source makes processing fail after the durable inbox/outbox commit.
    await prisma.bankConnection.update({ where: { id: aDestination.connectionId }, data: { status: "PAUSED" } });
    for (let attempt = 1; attempt <= 5; attempt++) {
      const result = await processBankOutbox();
      assert.equal(result.retried, 1);
      const job = await prisma.bankSyncOutbox.findFirstOrThrow({ where: { aggregateId: poisoned.id } });
      assert.equal(job.retryCount, attempt);
      assert.equal(job.status, attempt === 5 ? "DLQ" : "RETRY");
      if (attempt < 5) await prisma.bankSyncOutbox.update({ where: { id: job.id },
        data: { nextAttemptAt: new Date(Date.now() - 60_000) } });
    }
    assert.equal((await processBankOutbox()).processed, 0);
    assert.equal((await prisma.bankRawEvent.findUniqueOrThrow({ where: { id: poisoned.id } })).processingStatus, "DLQ");
    assert.equal(await prisma.bankTransaction.count({ where: { bankAccountId: aDestination.account.id, externalTransactionId: "queue-poison" } }), 0);
    await prisma.bankConnection.update({ where: { id: aDestination.connectionId }, data: { status: "ACTIVE" } });
    ok("five durable processing failures enter DLQ and never post an unreviewed transaction");

    const oldReplaySecret = process.env.FINOVA_BANK_REPLAY_SECRET;
    const replaySecret = `synthetic-replay-${randomUUID()}`;
    process.env.FINOVA_BANK_REPLAY_SECRET = replaySecret;
    try {
      const replayRequest = (token: string, workspaceId = a.context.workspaceId) => new NextRequest(
        "http://localhost/api/internal/bank-sync/replay", { method: "POST", headers: {
          authorization: `Bearer ${token}`, "content-type": "application/json",
        }, body: JSON.stringify({ workspaceId, eventId: poisoned.id, reasonCode: "SOURCE_RESTORED" }) });
      assert.equal((await replayDeadLetter(replayRequest("forged"))).status, 401);
      assert.equal((await replayDeadLetter(replayRequest(replaySecret, b.context.workspaceId))).status, 404);
      const malformed = new NextRequest("http://localhost/api/internal/bank-sync/replay", {
        method: "POST", headers: { authorization: `Bearer ${replaySecret}` }, body: "{" });
      assert.equal((await replayDeadLetter(malformed)).status, 400);
      const oversized = new NextRequest("http://localhost/api/internal/bank-sync/replay", {
        method: "POST", headers: { authorization: `Bearer ${replaySecret}` }, body: JSON.stringify({ padding: "z".repeat(2200) }) });
      assert.equal((await replayDeadLetter(oversized)).status, 413);
      const concurrentReplay = await Promise.all([replayDeadLetter(replayRequest(replaySecret)), replayDeadLetter(replayRequest(replaySecret))]);
      assert.deepEqual(concurrentReplay.map(result => result.status).sort(), [200, 409]);
      assert.equal((await replayDeadLetter(replayRequest(replaySecret))).status, 409);
      const requeued = await prisma.bankSyncOutbox.findFirstOrThrow({ where: { aggregateId: poisoned.id } });
      assert.equal(requeued.status, "PENDING");
      assert.equal(requeued.retryCount, 0);
      assert.equal(await prisma.bankAuditEvent.count({ where: { workspaceId: a.context.workspaceId,
        resourceId: poisoned.id, action: "DLQ_REPLAY_REQUESTED" } }), 1);
      await prisma.bankConsent.updateMany({ where: { connectionId: aDestination.connectionId }, data: { revokedAt: new Date() } });
      const revokedAfterReplay = await processBankOutbox();
      assert.equal(revokedAfterReplay.retried, 1);
      assert.equal(await prisma.bankTransaction.count({ where: { bankAccountId: aDestination.account.id,
        externalTransactionId: "queue-poison" } }), 0);
      await prisma.bankConsent.updateMany({ where: { connectionId: aDestination.connectionId }, data: { revokedAt: null } });
      await prisma.bankSyncOutbox.update({ where: { id: requeued.id }, data: { nextAttemptAt: new Date(Date.now() - 60_000) } });
      ok("revocation between replay and worker processing prevents any canonical or ledger transaction");
      const replayed = await Promise.all([processBankOutbox(), processBankOutbox()]);
      assert.equal(replayed.reduce((sum, worker) => sum + worker.processed, 0), 1);
      assert.equal(await prisma.bankTransaction.count({ where: { bankAccountId: aDestination.account.id,
        externalTransactionId: "queue-poison" } }), 1);
      assert.equal(await prisma.bankTransactionLink.count({ where: { workspaceId: a.context.workspaceId,
        bankTransaction: { externalTransactionId: "queue-poison" } } }), 0);
      ok("operator bearer and workspace scope protect one audited DLQ replay; two workers create review only");

      const staleMapping = envelope(`ipn:${randomUUID()}`, aDestination.account.providerAccountRef, "stale-mapping");
      const staleEvent = await persistBankEnvelope("SEPAY_BANKHUB", aDestination.connectionId, staleMapping, raw(staleMapping));
      await prisma.bankConnection.update({ where: { id: aDestination.connectionId }, data: { status: "PAUSED" } });
      for (let attempt = 0; attempt < 5; attempt++) {
        assert.equal((await processBankOutbox()).retried, 1);
        const job = await prisma.bankSyncOutbox.findFirstOrThrow({ where: { aggregateId: staleEvent.id } });
        if (attempt < 4) await prisma.bankSyncOutbox.update({ where: { id: job.id }, data: { nextAttemptAt: new Date(Date.now() - 60_000) } });
      }
      await prisma.bankConnection.update({ where: { id: aDestination.connectionId }, data: { status: "ACTIVE" } });
      await prisma.bankAccount.update({ where: { id: aDestination.account.id }, data: { status: "INACTIVE" } });
      const replacement = await prisma.bankAccount.create({ data: { workspaceId: a.context.workspaceId,
        connectionId: aDestination.connectionId, providerAccountRef: `replacement-${randomUUID()}`, accountMasked: "**** REPLACEMENT" } });
      const staleRequest = () => new NextRequest("http://localhost/api/internal/bank-sync/replay", {
        method: "POST", headers: { authorization: `Bearer ${replaySecret}`, "content-type": "application/json" },
        body: JSON.stringify({ workspaceId: a.context.workspaceId, eventId: staleEvent.id, reasonCode: "OPERATOR_REVIEWED" }),
      });
      assert.equal((await replayDeadLetter(staleRequest())).status, 409);
      assert.equal((await prisma.bankSyncOutbox.findFirstOrThrow({ where: { aggregateId: staleEvent.id } })).status, "DLQ");
      await prisma.bankAccount.update({ where: { id: aDestination.account.id }, data: { status: "ACTIVE" } });
      await prisma.bankAccount.update({ where: { id: replacement.id }, data: { status: "INACTIVE" } });
      assert.equal((await replayDeadLetter(staleRequest())).status, 200);
      assert.equal((await processBankOutbox()).processed, 1);
      assert.equal(await prisma.bankTransaction.count({ where: { bankAccountId: aDestination.account.id,
        externalTransactionId: "stale-mapping" } }), 1);
      ok("DLQ replay rejects a detached source account even when another account remains active");
    } finally {
      if (oldReplaySecret === undefined) delete process.env.FINOVA_BANK_REPLAY_SECRET;
      else process.env.FINOVA_BANK_REPLAY_SECRET = oldReplaySecret;
    }

    const queuedBeforeRevoke = envelope(`ipn:${randomUUID()}`, bSource.account.providerAccountRef, "queued-revoked");
    await persistBankEnvelope("SEPAY_BANKHUB", bSource.connectionId, queuedBeforeRevoke, raw(queuedBeforeRevoke));
    await prisma.bankConsent.updateMany({ where: { connectionId: bSource.connectionId }, data: { revokedAt: new Date() } });
    const revokedWork = await processBankOutbox();
    assert.equal(revokedWork.retried, 1);
    assert.equal(await prisma.bankTransaction.count({ where: { bankAccountId: bSource.account.id } }), 0);
    assert.equal(await prisma.bankReviewItem.count({ where: { workspaceId: b.context.workspaceId } }), 0);
    ok("a previously accepted but unprocessed event cannot enter review after consent is revoked");
    const revoked = envelope(`ipn:${randomUUID()}`, bSource.account.providerAccountRef, "revoked-consent");
    await assert.rejects(persistBankEnvelope("SEPAY_BANKHUB", bSource.connectionId, revoked, raw(revoked)));
    assert.equal(await prisma.bankRawEvent.count({ where: { connectionId: bSource.connectionId } }), 1);
    ok("revoked consent fails closed without accepting or storing a new bank event");

    const oldIpnKey = process.env.FINOVA_SEPAY_BANKHUB_IPN_API_KEY;
    const oldSePayEnabled = process.env.FINOVA_SEPAY_BANKHUB_ENABLED;
    const syntheticIpnKey = `synthetic-integration-${randomUUID()}`;
    process.env.FINOVA_SEPAY_BANKHUB_IPN_API_KEY = syntheticIpnKey;
    process.env.FINOVA_SEPAY_BANKHUB_ENABLED = "1";
    try {
      const sourceIpn = { gateway: "TestBank", transaction_date: "2026-10-22 10:00:00",
        bank_account_xid: aDestination.account.providerAccountRef, account_number: "****synthetic",
        content: "Synthetic IPN only", transfer_type: "credit", amount: 4567,
        reference_code: "synthetic-reference", transaction_id: `ipn-route-${randomUUID()}` };
      const makeRequest = (payload: unknown, auth = `Apikey ${syntheticIpnKey}`) => new NextRequest(
        "http://localhost/api/webhooks/sepay-bankhub/ipn", { method: "POST",
          headers: { authorization: auth, "content-type": "application/json" }, body: JSON.stringify(payload) });
      assert.equal((await receiveSePayIpn(makeRequest(sourceIpn, "Apikey forged"))).status, 401);
      assert.equal((await receiveSePayIpn(makeRequest({ ...sourceIpn, amount: -1 }))).status, 400);
      const before = await prisma.bankRawEvent.count({ where: { connectionId: aDestination.connectionId } });
      const accepted = await receiveSePayIpn(makeRequest(sourceIpn));
      assert.equal(accepted.status, 200);
      assert.deepEqual(await accepted.json(), { success: true });
      const repeated = await receiveSePayIpn(makeRequest(sourceIpn));
      assert.equal(repeated.status, 200);
      assert.equal(await prisma.bankRawEvent.count({ where: { connectionId: aDestination.connectionId } }), before + 1);
      const ipnRaw = await prisma.bankRawEvent.findUniqueOrThrow({ where: {
        providerCode_connectionId_externalEventId: { providerCode: "SEPAY_BANKHUB",
          connectionId: aDestination.connectionId, externalEventId: `ipn:${sourceIpn.bank_account_xid}:${sourceIpn.transaction_id}` } } });
      assert.equal(ipnRaw.deliveryCount, 2);
      assert.equal(await prisma.bankSyncOutbox.count({ where: { aggregateId: ipnRaw.id } }), 1);
      assert.notEqual(ipnRaw.payloadCiphertext, JSON.stringify(sourceIpn));
      const payload = JSON.parse(openBankEvent(ipnRaw.payloadCiphertext).toString("utf8"));
      assert.equal(JSON.parse(Buffer.from(payload.originalBase64, "base64").toString("utf8")).transaction_id, sourceIpn.transaction_id);
      const revokedResult = await receiveSePayIpn(makeRequest({ ...sourceIpn, bank_account_xid: bSource.account.providerAccountRef,
        transaction_id: `revoked-ipn-${randomUUID()}` }));
      assert.equal(revokedResult.status, 403);
      await processBankOutbox();
      assert.equal(await prisma.bankTransaction.count({ where: {
        bankAccountId: aDestination.account.id, externalTransactionId: sourceIpn.transaction_id } }), 1);
      const ipnCanonical = await prisma.bankTransaction.findFirstOrThrow({ where: {
        bankAccountId: aDestination.account.id, externalTransactionId: sourceIpn.transaction_id } });
      assert.equal(await prisma.bankTransactionLink.count({ where: { bankTransactionId: ipnCanonical.id } }), 0);
      ok("HTTP SePay IPN rejects forgery and bad payload, ACKs only after encrypted durable commit, and dedupes redelivery");
    } finally {
      if (oldIpnKey === undefined) delete process.env.FINOVA_SEPAY_BANKHUB_IPN_API_KEY;
      else process.env.FINOVA_SEPAY_BANKHUB_IPN_API_KEY = oldIpnKey;
      if (oldSePayEnabled === undefined) delete process.env.FINOVA_SEPAY_BANKHUB_ENABLED;
      else process.env.FINOVA_SEPAY_BANKHUB_ENABLED = oldSePayEnabled;
    }

    await verifyPartnerHistory();

    // Exercise the actual route, Better Auth signed session and PostgreSQL,
    // not a mocked requireContext or mocked sync service. Google OAuth itself
    // still requires separate browser/provider UAT.
    async function verifyAuthenticatedManualSync() {
      const personalWorkspaceId = await bootstrapPersonalWorkspace({ id: a.context.userId, name: a.context.name });
      workspaceIds.push(personalWorkspaceId);
      const personalContext = { ...a.context, workspaceId: personalWorkspaceId };
      const wallet = await createWallet(personalContext, { name: "Authenticated manual sync bank",
        type: "BANK", openingBalance: "0", openingDate: stamp });
      const companyXid = `synthetic-auth-company-${randomUUID()}`;
      const accountXid = `synthetic-auth-account-${randomUUID()}`;
      const connected = await prisma.bankConnection.create({ data: {
        workspaceId: personalWorkspaceId, providerCode: "SEPAY_BANKHUB", status: "ACTIVE",
        providerConnectionRef: companyXid, postingPolicy: "REVIEW_FIRST",
      } });
      await prisma.bankAccount.create({ data: { workspaceId: personalWorkspaceId,
        connectionId: connected.id, providerAccountRef: accountXid, accountMasked: "**** AUTH", walletId: wallet.id } });
      await prisma.bankConsent.create({ data: { workspaceId: personalWorkspaceId, connectionId: connected.id,
        scopeJson: { transactions: true, bankAccountXid: accountXid }, purposeVersion: "synthetic-auth-v1",
        evidenceRef: "signed-session-test-only", grantedAt: new Date() } });
      const sessionToken = randomUUID();
      await prisma.session.create({ data: { id: randomUUID(), userId: a.context.userId,
        token: sessionToken, expiresAt: new Date(Date.now() + 30 * 60_000) } });
      const authContext = await auth.$context;
      const signature = createHmac("sha256", authContext.secret).update(sessionToken).digest("base64");
      const cookie = `${authContext.authCookies.sessionToken.name}=${encodeURIComponent(`${sessionToken}.${signature}`)}`;
      const origin = configuredAppOrigin();
      assert.ok(origin, "Authenticated manual sync test requires configured app origin");
      function routeRequest(id: string, options: { cookie?: string; origin?: string } = {}) {
        return new NextRequest(`${origin}/api/v1/bank-sync/connections/${id}/sync?workspaceId=${a.context.workspaceId}`, {
          method: "POST", headers: { origin: options.origin ?? origin!, "content-type": "application/json",
            ...(options.cookie ? { cookie: options.cookie } : {}) },
          body: JSON.stringify({ from: "2026-10-21", to: "2026-10-22" }),
        });
      }
      const send = (id: string, options?: { cookie?: string; origin?: string }) =>
        manualSePaySync(routeRequest(id, options), { params: Promise.resolve({ id }) });
      assert.equal((await send(connected.id)).status, 401);
      assert.equal((await send(connected.id, { cookie, origin: "https://attacker.invalid" })).status, 403);
      assert.equal((await send(connected.id, { cookie: cookie.replace(sessionToken, randomUUID()) })).status, 401);
      ok("Manual sync HTTP route enforces actual signed Better Auth session and same-origin mutation");

      const env = { enabled: process.env.FINOVA_SEPAY_BANKHUB_ENABLED,
        clientId: process.env.FINOVA_SEPAY_BANKHUB_CLIENT_ID,
        clientSecret: process.env.FINOVA_SEPAY_BANKHUB_CLIENT_SECRET };
      const originalFetch = globalThis.fetch;
      process.env.FINOVA_SEPAY_BANKHUB_ENABLED = "1";
      process.env.FINOVA_SEPAY_BANKHUB_CLIENT_ID = "synthetic-auth-client";
      process.env.FINOVA_SEPAY_BANKHUB_CLIENT_SECRET = "synthetic-auth-secret";
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith("/token")) return new Response(JSON.stringify({ access_token: "synthetic-auth-token", ttl: 600 }), { status: 201 });
        assert.equal(url.pathname.endsWith("/transaction"), true);
        assert.equal(url.searchParams.get("company_xid"), companyXid);
        assert.equal(url.searchParams.get("bank_account_xid"), accountXid);
        return new Response(JSON.stringify({ data: [{ transaction_id: "auth-route-one",
          transaction_date: "2026-10-22 10:00:00", company_xid: companyXid,
          bank_account_xid: accountXid, transfer_type: "credit", amount: 12345,
          transaction_content: "Synthetic signed-session manual sync" }],
          meta: { page: 1, total_pages: 1 } }), { status: 200 });
      }) as typeof fetch;
      try {
        const beforeJournals = await prisma.journal.count({ where: { workspaceId: personalWorkspaceId } });
        const foreign = await send(aSource.connectionId, { cookie });
        assert.equal(foreign.status, 404);
        ok("Signed session cannot sync a connection owned by a different workspace");

        const accepted = await send(connected.id, { cookie });
        assert.equal(accepted.status, 200, JSON.stringify(await accepted.clone().json()));
        assert.equal((await accepted.json()).data.accepted, 1);
        const repeated = await send(connected.id, { cookie });
        assert.equal(repeated.status, 200, JSON.stringify(await repeated.clone().json()));
        assert.deepEqual({ accepted: (await repeated.json()).data.accepted }, { accepted: 0 });
        assert.equal(await prisma.bankRawEvent.count({ where: { connectionId: connected.id } }), 1);
        assert.equal(await prisma.bankSyncJob.count({ where: { connectionId: connected.id, status: "DONE" } }), 2);
        const completed = await prisma.bankConnection.findUniqueOrThrow({ where: { id: connected.id } });
        assert.ok(completed.lastSyncedAt);
        ok("Authenticated manual sync persists job/watermark and dedupes repeated HTTP requests");

        await processBankOutbox(50);
        assert.equal(await prisma.bankReviewItem.count({ where: { workspaceId: personalWorkspaceId } }), 1);
        assert.equal(await prisma.journal.count({ where: { workspaceId: personalWorkspaceId } }), beforeJournals);
        ok("Authenticated route leaves imported bank rows in review without an automatic ledger post");

        await prisma.bankConsent.updateMany({ where: { connectionId: connected.id, revokedAt: null },
          data: { revokedAt: new Date() } });
        assert.equal((await send(connected.id, { cookie })).status, 409);
        assert.equal((await prisma.bankConnection.findUniqueOrThrow({ where: { id: connected.id } })).lastSyncedAt?.getTime(),
          completed.lastSyncedAt?.getTime());
        ok("Revoked consent blocks authenticated route and preserves the sync watermark");
      } finally {
        globalThis.fetch = originalFetch;
        for (const [key, value] of Object.entries({ FINOVA_SEPAY_BANKHUB_ENABLED: env.enabled,
          FINOVA_SEPAY_BANKHUB_CLIENT_ID: env.clientId, FINOVA_SEPAY_BANKHUB_CLIENT_SECRET: env.clientSecret })) {
          if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
        const rateKey = createHash("sha256").update(`mutation:${a.context.userId}:${personalWorkspaceId}`).digest("hex");
        await prisma.apiRateLimit.deleteMany({ where: { key: rateKey } });
      }
    }
    await verifyAuthenticatedManualSync();
    assert.equal((await auditLedger(prisma, a.context.workspaceId)).findings.UNBALANCED_JOURNAL.length, 0);
    assert.equal((await auditLedger(prisma, b.context.workspaceId)).findings.UNBALANCED_JOURNAL.length, 0);
    console.log(`PASS: ${checks} PostgreSQL Bank Sync integration scenarios`);
  } finally {
    await prisma.apiRateLimit.deleteMany({ where: { key: testReplayQuotaKey } });
    for (const workspaceId of workspaceIds) {
      await cleanupBankSyncFixture(workspaceId);
      // Deferred journal constraints must see both deletions in one commit.
      await prisma.$transaction(async db => {
        await db.posting.deleteMany({ where: { journal: { workspaceId } } });
        await db.journal.deleteMany({ where: { workspaceId } });
      });
      await prisma.transaction.deleteMany({ where: { workspaceId } });
      await prisma.wallet.deleteMany({ where: { workspaceId } });
      await prisma.category.deleteMany({ where: { workspaceId } });
      await prisma.ledgerAccount.deleteMany({ where: { workspaceId } });
      await prisma.membership.deleteMany({ where: { workspaceId } });
      await prisma.auditLog.deleteMany({ where: { workspaceId } });
      await prisma.workspace.delete({ where: { id: workspaceId } });
    }
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
