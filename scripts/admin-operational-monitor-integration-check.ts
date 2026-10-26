/** AD5-08 durable incident lifecycle against an explicitly isolated local QA database. */
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { prisma } from "../src/lib/db";
import { acknowledgeBillingOperationalIncident, getOperatorBillingIncidents,
  runBillingOperationalSweep } from "../src/modules/admin/billing-operational-monitor";
import { operationalRelayRetryMs, processBillingOperationalRelay } from "../src/modules/admin/billing-operational-relay";

const source = new URL(process.env.DATABASE_URL ?? "postgres://invalid/invalid");
assert.equal(source.hostname, "127.0.0.1");
assert.equal(source.port, "55433");
assert.equal(source.pathname, "/finova_admin_test_monitor_20261026");
process.env.FINOVA_BILLING_ALERTS_ENABLED = "1";
delete process.env.FINOVA_BILLING_PROVIDER_HEALTH_URL;
const now = new Date();
const marker = randomUUID().replaceAll("-", "");
const operatorIds = ["fin", "admin", "super"].map(role => "qa_ops_" + role + "_" + marker);
const [fin, admin, superAdmin] = operatorIds;
const resourceId = "qa_ops_" + marker;

async function addBurst(at: Date) {
  await prisma.adminAuditLog.createMany({ data: Array.from({ length: 5 }, (_, index) => ({
    actorId: fin, action: "RECEIVER_APPROVE", resourceType: "QA_OPS",
    resourceId, reason: null, createdAt: new Date(at.getTime() + index),
  })) });
}

async function run() {
  assert.equal(await prisma.user.count(), 0, "QA monitor database must be empty");
  assert.equal(await prisma.billingOperationalIncident.count(), 0, "QA monitor database must be empty");
  try {
    for (const [index, userId] of operatorIds.entries()) {
      await prisma.user.create({ data: { id: userId, name: "QA Operator", email: userId + "@example.invalid" } });
      await prisma.systemRoleAssignment.create({ data: { userId,
        role: (["FINANCE_OPERATOR", "ADMIN", "SUPER_ADMIN"] as const)[index] } });
    }
    await addBurst(new Date(now.getTime() - 60_000));
    const initial = await runBillingOperationalSweep(now);
    assert.equal(initial.opened, 1);
    assert.equal(initial.delivered, 1, "Warning is delivered only to Finance operator");
    const incident = await prisma.billingOperationalIncident.findUniqueOrThrow({
      where: { code: "ADMIN_AUDIT_BURST" },
    });
    assert.equal(incident.state, "OPEN");
    const repeated = await runBillingOperationalSweep(new Date(now.getTime() + 10_000));
    assert.equal(repeated.opened, 0);
    assert.equal(repeated.delivered, 0, "Repeated scans may not deliver duplicates");
    const initialRelay = await prisma.billingOperationalRelay.findFirstOrThrow({
      where: { incidentId: incident.id, phase: "PRIMARY" },
    });
    assert.equal(initialRelay.state, "PENDING");
    assert.equal((await processBillingOperationalRelay()).enabled, false,
      "Unconfigured relay must never attempt an external request");
    process.env.FINOVA_BILLING_ALERT_RELAY_URL = "https://alerts.example.org/ingest";
    process.env.FINOVA_BILLING_ALERT_RELAY_SECRET = "qa-only-secret-012345678901234567890123";
    const originalFetch = globalThis.fetch;
    const requests: Array<{ headers: HeadersInit | undefined; body: BodyInit | null | undefined }> = [];
    globalThis.fetch = (async (_url, init) => {
      requests.push({ headers: init?.headers, body: init?.body });
      return { ok: true, status: 202 } as Response;
    }) as typeof fetch;
    try {
      const dispatched = await processBillingOperationalRelay(new Date(now.getTime() + 15_000));
      assert.equal(dispatched.delivered, 1);
      assert.equal(requests.length, 1);
      assert.ok(JSON.stringify(requests).includes("FINOVA_BILLING_OPERATIONAL_ALERT"));
      assert.ok(!JSON.stringify(requests).includes("@example.invalid"));
      const headers = requests[0].headers as Record<string, string>;
      const body = requests[0].body as string;
      assert.equal(headers["X-Finova-Alert-Signature"],
        "sha256=" + createHmac("sha256", process.env.FINOVA_BILLING_ALERT_RELAY_SECRET!)
          .update(headers["X-Finova-Alert-Timestamp"] + "." + body).digest("hex"));
      assert.equal(headers["X-Finova-Alert-Idempotency-Key"], initialRelay.id);
      assert.equal((await processBillingOperationalRelay(new Date(now.getTime() + 20_000))).delivered, 0,
        "Relay acceptance should not produce duplicate messages");
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.FINOVA_BILLING_ALERT_RELAY_URL;
      delete process.env.FINOVA_BILLING_ALERT_RELAY_SECRET;
    }

    const financeInbox = await getOperatorBillingIncidents({ userId: fin, role: "FINANCE_OPERATOR" });
    const adminInbox = await getOperatorBillingIncidents({ userId: admin, role: "ADMIN" });
    assert.equal(financeInbox.length, 1);
    assert.equal(adminInbox.length, 0, "Unassigned admins do not see private deliveries");
    await assert.rejects(
      acknowledgeBillingOperationalIncident({ userId: admin, role: "ADMIN" }, incident.id),
      (error: unknown) => !!error && typeof error === "object" && "status" in error && error.status === 403,
    );
    // A delivery is historical evidence, not continuing authorization. When
    // Finance is replaced by Admin, the old warning cannot be read or ACKed.
    await prisma.systemRoleAssignment.updateMany({ where: { userId: fin },
      data: { role: "ADMIN" } });
    assert.equal((await getOperatorBillingIncidents({ userId: fin, role: "ADMIN" })).length, 0,
      "Changing to Admin must hide a prior Finance warning delivery");
    await assert.rejects(
      acknowledgeBillingOperationalIncident({ userId: fin, role: "ADMIN" }, incident.id),
      (error: unknown) => !!error && typeof error === "object" && "status" in error && error.status === 403,
    );
    await prisma.systemRoleAssignment.updateMany({ where: { userId: fin },
      data: { role: "FINANCE_OPERATOR" } });
    assert.equal((await getOperatorBillingIncidents({ userId: fin, role: "FINANCE_OPERATOR" })).length, 1);
    await prisma.adminAuditLog.updateMany({ where: { resourceId }, data: {
      createdAt: new Date(now.getTime() + 30 * 60_000),
    } });
    const escalateAt = new Date(now.getTime() + 31 * 60_000);
    const escalated = await runBillingOperationalSweep(escalateAt);
    assert.equal(escalated.escalated, 1);
    assert.equal(escalated.delivered, 1, "Super Admin receives escalation");
    assert.equal(await prisma.billingOperationalRelay.count({ where: {
      incidentId: incident.id, phase: "ESCALATION", state: "PENDING",
    } }), 1);
    const duplicated = await runBillingOperationalSweep(new Date(escalateAt.getTime() + 5000));
    assert.equal(duplicated.escalated, 0);
    assert.equal(duplicated.delivered, 0);
    const ack = await acknowledgeBillingOperationalIncident(
      { userId: superAdmin, role: "SUPER_ADMIN" }, incident.id, new Date(escalateAt.getTime() + 7000),
    );
    assert.equal(ack.changed, true);
    const secondAck = await acknowledgeBillingOperationalIncident(
      { userId: superAdmin, role: "SUPER_ADMIN" }, incident.id, new Date(escalateAt.getTime() + 8000),
    );
    assert.equal(secondAck.changed, false, "Idempotent acknowledgement");
    await prisma.adminAuditLog.deleteMany({ where: { resourceId } });
    const closed = await runBillingOperationalSweep(new Date(now.getTime() + 32 * 60_000));
    assert.equal(closed.resolved, 1);
    assert.equal((await prisma.billingOperationalIncident.findUniqueOrThrow({ where: { id: incident.id } })).state, "RESOLVED");
    await addBurst(new Date(now.getTime() + 33 * 60_000));
    const reopened = await runBillingOperationalSweep(new Date(now.getTime() + 34 * 60_000));
    assert.equal(reopened.opened, 1);
    const reopenedIncident = await prisma.billingOperationalIncident.findUniqueOrThrow({ where: { id: incident.id } });
    assert.equal(reopenedIncident.generation, 2);
    assert.equal(reopenedIncident.state, "OPEN");
    assert.equal(await prisma.billingOperationalDelivery.count({ where: { incidentId: incident.id } }), 3);
    assert.equal(await prisma.billingOperationalRelay.count({ where: { incidentId: incident.id } }), 3);
    // Non-2xx response uses bounded backoff; next run before due must not retry.
    process.env.FINOVA_BILLING_ALERT_RELAY_URL = "https://alerts.example.org/ingest";
    process.env.FINOVA_BILLING_ALERT_RELAY_SECRET = "qa-only-secret-012345678901234567890123";
    const previousFetch = globalThis.fetch;
    let relayRequests = 0;
    globalThis.fetch = (async () => { relayRequests++; return { ok: false, status: 503 } as Response; }) as typeof fetch;
    try {
      const attemptAt = new Date(now.getTime() + 34 * 60_000 + 1000);
      const failed = await processBillingOperationalRelay(attemptAt);
      assert.equal(failed.deferred, 1, "Active reopened incident must retry on relay 503");
      assert.equal(relayRequests, 1);
      const premature = await processBillingOperationalRelay(new Date(attemptAt.getTime() + 1000));
      assert.equal(premature.deferred, 0);
      assert.equal(relayRequests, 1);
      globalThis.fetch = (async () => { relayRequests++; return { ok: true, status: 202 } as Response; }) as typeof fetch;
      const recovered = await processBillingOperationalRelay(new Date(attemptAt.getTime() + 16_000));
      assert.equal(recovered.delivered, 1);
      assert.equal(relayRequests, 2);
    } finally {
      globalThis.fetch = previousFetch;
      delete process.env.FINOVA_BILLING_ALERT_RELAY_URL;
      delete process.env.FINOVA_BILLING_ALERT_RELAY_SECRET;
    }
    assert.deepEqual((await prisma.billingOperationalHistory.findMany({ where: { incidentId: incident.id },
      orderBy: { at: "asc" }, select: { action: true } })).map(item => item.action),
      ["OPENED", "ESCALATED", "ACKNOWLEDGED", "RESOLVED", "REOPENED"]);
    // Independent provider probe: three failed HTTPS checks trigger an advisory,
    // a healthy response clears it. Never claim an IPN outage from order silence.
    process.env.FINOVA_BILLING_PROVIDER_HEALTH_URL = "https://api.sepay.vn/health";
    const fetchBeforeProbe = globalThis.fetch;
    let healthOk = false;
    globalThis.fetch = (async () => ({ ok: healthOk }) as Response) as typeof fetch;
    try {
      const base = now.getTime() + 35 * 60_000;
      for (let index = 0; index < 2; index++) {
        await runBillingOperationalSweep(new Date(base + index * 60_000));
        assert.equal(await prisma.billingOperationalIncident.count({ where: {
          code: "PROVIDER_PROBE_FAILURE",
        } }), 0);
      }
      await runBillingOperationalSweep(new Date(base + 2 * 60_000));
      assert.equal((await prisma.billingOperationalIncident.findUniqueOrThrow({ where: {
        code: "PROVIDER_PROBE_FAILURE",
      } })).state, "OPEN");
      healthOk = true;
      await runBillingOperationalSweep(new Date(base + 3 * 60_000));
      assert.equal((await prisma.billingOperationalIncident.findUniqueOrThrow({ where: {
        code: "PROVIDER_PROBE_FAILURE",
      } })).state, "RESOLVED");
      assert.equal((await prisma.billingProviderProbe.findUniqueOrThrow({ where: {
        id: "BILLING_PROVIDER",
      } })).consecutiveFailures, 0);
    } finally {
      globalThis.fetch = fetchBeforeProbe;
      delete process.env.FINOVA_BILLING_PROVIDER_HEALTH_URL;
    }
    // A live incident must recover if its original audience was empty.
    // Revoking every role also ensures the fallback is genuinely absent.
    await prisma.adminAuditLog.deleteMany({ where: { resourceId } });
    await runBillingOperationalSweep(new Date(now.getTime() + 39 * 60_000));
    await prisma.systemRoleAssignment.updateMany({
      where: { userId: { in: operatorIds } }, data: { revokedAt: new Date(now.getTime() + 39 * 60_000) },
    });
    await addBurst(new Date(now.getTime() + 40 * 60_000));
    const gap = await runBillingOperationalSweep(new Date(now.getTime() + 41 * 60_000));
    assert.equal(gap.opened, 1);
    assert.equal(gap.recipientGaps, 1);
    assert.equal(gap.delivered, 0);
    const latest = await prisma.billingOperationalIncident.findUniqueOrThrow({
      where: { code: "ADMIN_AUDIT_BURST" },
    });
    assert.equal(await prisma.billingOperationalRelay.count({ where: {
      incidentId: latest.id, generation: latest.generation,
    } }), 0);
    await prisma.systemRoleAssignment.updateMany({ where: { userId: fin },
      data: { revokedAt: null } });
    const recoveredRecipients = await runBillingOperationalSweep(new Date(now.getTime() + 41 * 60_000 + 5000));
    assert.equal(recoveredRecipients.opened, 0);
    assert.equal(recoveredRecipients.delivered, 1);
    assert.equal(recoveredRecipients.recipientGaps, 0);
    assert.equal(await prisma.billingOperationalRelay.count({ where: {
      incidentId: latest.id, generation: latest.generation, phase: "PRIMARY",
    } }), 1, "Late assignment must create the missing external relay job");
    assert.equal((await runBillingOperationalSweep(new Date(now.getTime() + 41 * 60_000 + 10_000))).delivered,
      0, "Repeated scans must not duplicate the late delivery");
    assert.equal((await getOperatorBillingIncidents({ userId: fin, role: "FINANCE_OPERATOR" }))
      .filter(item => item.id === latest.id).length, 1, "Only current generation is visible");

    // Verify bounded delivery: six independent 503s exhaust the durable relay.
    process.env.FINOVA_BILLING_ALERT_RELAY_URL = "https://alerts.example.org/ingest";
    process.env.FINOVA_BILLING_ALERT_RELAY_SECRET = "qa-only-secret-012345678901234567890123";
    const beforeDeadLetterFetch = globalThis.fetch;
    let failedRequests = 0;
    globalThis.fetch = (async () => { failedRequests++; return { ok: false, status: 503 } as Response; }) as typeof fetch;
    try {
      let attemptAt = now.getTime() + 41 * 60_000 + 20_000;
      for (let attempt = 1; attempt <= 6; attempt++) {
        const outcomes = attempt === 1 ? await Promise.all([
          processBillingOperationalRelay(new Date(attemptAt)),
          processBillingOperationalRelay(new Date(attemptAt)),
        ]) : [await processBillingOperationalRelay(new Date(attemptAt))];
        assert.equal(outcomes.reduce((sum, outcome) => sum + (attempt === 6 ? outcome.dead : outcome.deferred), 0),
          1, "Concurrent workers must claim a relay only once");
        attemptAt += operationalRelayRetryMs(attempt) + 1000;
      }
      assert.equal((await processBillingOperationalRelay(new Date(attemptAt))).delivered, 0);
      assert.equal(failedRequests, 6, "Dead-letter must not send a seventh request");
      const dead = await prisma.billingOperationalRelay.findUniqueOrThrow({ where: {
        incidentId_generation_phase: { incidentId: latest.id, generation: latest.generation, phase: "PRIMARY" },
      } });
      assert.equal(dead.state, "DEAD");
      assert.equal(dead.attempts, 6);
    } finally {
      globalThis.fetch = beforeDeadLetterFetch;
      delete process.env.FINOVA_BILLING_ALERT_RELAY_URL;
      delete process.env.FINOVA_BILLING_ALERT_RELAY_SECRET;
    }
    const leak = JSON.stringify(await getOperatorBillingIncidents({ userId: fin, role: "FINANCE_OPERATOR" }));
    assert.ok(!leak.includes("@example.invalid") && !leak.includes(resourceId));
    console.log("PASS: AD5-08 PostgreSQL incident dedupe, role delivery, escalation, ACK, resolve/reopen and privacy");
  } finally {
    // Only delete fixtures created by this invocation in the specifically named QA database.
    await prisma.adminAuditLog.deleteMany({ where: { resourceId } });
    await prisma.adminAuditLog.deleteMany({ where: { actorId: { in: operatorIds },
      action: "BILLING_INCIDENT_ACK" } });
    const incidents = await prisma.billingOperationalIncident.findMany({ where: {
      code: { in: ["ADMIN_AUDIT_BURST", "PROVIDER_PROBE_FAILURE"] },
    },
      select: { id: true } });
    const ids = incidents.map(item => item.id);
    if (ids.length) {
      await prisma.billingOperationalRelay.deleteMany({ where: { incidentId: { in: ids } } });
      await prisma.billingOperationalDelivery.deleteMany({ where: { incidentId: { in: ids } } });
      await prisma.billingOperationalHistory.deleteMany({ where: { incidentId: { in: ids } } });
      await prisma.billingOperationalIncident.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.billingProviderProbe.deleteMany({ where: { id: "BILLING_PROVIDER" } });
    await prisma.systemRoleAssignment.deleteMany({ where: { userId: { in: operatorIds } } });
    await prisma.user.deleteMany({ where: { id: { in: operatorIds } } });
    await prisma.$disconnect();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
