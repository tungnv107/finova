/** Real Better Auth signed-cookie API checks against an isolated PostgreSQL QA database. */
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { prisma } from "../src/lib/db";
import { auth } from "../src/server/auth";
import { PATCH as changeAccess } from "../src/app/api/v1/admin/users/[id]/access/route";
import { POST as proposeGrant } from "../src/app/api/v1/admin/users/[id]/subscription/grants/route";
import { POST as proposeRevoke } from "../src/app/api/v1/admin/subscriptions/[id]/revoke/route";
import { POST as decideGrant } from "../src/app/api/v1/admin/subscriptions/actions/[id]/decision/route";
import { GET as listAdminUsers } from "../src/app/api/v1/admin/users/route";
import { GET as readAdminUser } from "../src/app/api/v1/admin/users/[id]/route";
import { GET as listAdminPayments } from "../src/app/api/v1/admin/billing/payments/route";
import { GET as adminOverview } from "../src/app/api/v1/admin/overview/route";

const origin = process.env.BETTER_AUTH_URL || "http://localhost:3002";
const suffix = randomUUID().replaceAll("-", "");
const ids = {
  root: "qasess_root_" + suffix,
  admin: "qasess_admin_" + suffix,
  analyst: "qasess_analyst_" + suffix,
  finance: "qasess_finance_" + suffix,
  owner: "qasess_owner_" + suffix,
  target: "qasess_target_" + suffix,
};
const users = Object.values(ids);
const workspaceId = "qasess_ws_" + suffix;
const reason = "QA incident and independent documented authorization";

async function main() {
  assert.match(new URL(process.env.DATABASE_URL ?? "postgres://invalid/invalid").pathname,
    /^\/finova_admin_test_[A-Za-z0-9_]+$/, "Must use an isolated Admin QA database");
  process.env.FINOVA_ADMIN_ENABLED = "1";
  const context = await auth.$context;
  const issuedTokens: string[] = [];
  async function signedCookie(userId: string, createdAt = new Date()) {
    const token = randomUUID();
    issuedTokens.push(token);
    await prisma.session.create({ data: {
      id: randomUUID(), token, userId, createdAt,
      expiresAt: new Date(Date.now() + 3_600_000),
    } });
    const signature = createHmac("sha256", context.secret).update(token).digest("base64");
    return context.authCookies.sessionToken.name + "=" + encodeURIComponent(token + "." + signature);
  }
  function mutation(method: "PATCH" | "POST", path: string, body: object, cookie?: string, requestOrigin = origin) {
    return new NextRequest(origin + path, {
      method, headers: {
        origin: requestOrigin, "Content-Type": "application/json",
        ...(cookie ? { cookie } : {}),
      }, body: JSON.stringify(body),
    });
  }
  async function expectCode(response: Response, status: number, code: string) {
    assert.equal(response.status, status);
    const body = await response.json();
    assert.equal(body.error?.code, code);
  }
  const accessPath = "/api/v1/admin/users/" + ids.target + "/access";
  const accessParams = { params: Promise.resolve({ id: ids.target }) };
  const grantPath = "/api/v1/admin/users/" + ids.target + "/subscription/grants";
  const grantParams = { params: Promise.resolve({ id: ids.target }) };
  let grantActionId = "";
  let revokeActionId = "";
  let testError: unknown;
  try {
    await prisma.user.createMany({ data: users.map(id => ({
      id, name: "Admin signed session QA", email: id + "@example.test", emailVerified: true,
    })) });
    await prisma.systemRoleAssignment.createMany({ data: [
      { userId: ids.root, role: "SUPER_ADMIN" },
      { userId: ids.admin, role: "ADMIN" },
      { userId: ids.analyst, role: "ANALYST" },
      { userId: ids.finance, role: "FINANCE_OPERATOR" },
    ] });
    await prisma.workspace.create({ data: { id: workspaceId, name: "QA owner workspace", createdById: ids.owner,
      memberships: { create: { userId: ids.owner, role: "OWNER" } } } });
    const fresh = await signedCookie(ids.admin);
    const root = await signedCookie(ids.root);
    const analyst = await signedCookie(ids.analyst);
    const old = await signedCookie(ids.admin, new Date(Date.now() - 3_600_000));
    await prisma.session.update({ where: { token: issuedTokens[3] },
      data: { updatedAt: new Date() } });
    const targetSession = await signedCookie(ids.target);
    const finance = await signedCookie(ids.finance);
    const owner = await signedCookie(ids.owner);
    const change = (cookie?: string, status = "SUSPENDED", requestOrigin = origin) =>
      changeAccess(mutation("PATCH", accessPath, { status, reason }, cookie, requestOrigin), accessParams);

    await expectCode(await change(), 401, "UNAUTHENTICATED");
    await expectCode(await change(fresh + "tampered"), 401, "UNAUTHENTICATED");
    await expectCode(await change(analyst), 403, "SYSTEM_ROLE_REQUIRED");
    await expectCode(await change(finance), 403, "SYSTEM_ROLE_REQUIRED");
    await expectCode(await change(owner), 403, "SYSTEM_ROLE_REQUIRED");
    await expectCode(await change(old), 403, "REAUTH_REQUIRED");
    await expectCode(await change(fresh, "SUSPENDED", "https://evil.example.test"), 403, "INVALID_ORIGIN");
    await expectCode(await change(fresh, "SUSPENDED", ""), 403, "ORIGIN_REQUIRED");

    // Exercise actual signed cookies across the whole system-role matrix.
    const read = (path: string, cookie?: string) => new NextRequest(origin + path, {
      headers: cookie ? { cookie } : {},
    });
    for (const [route, handler, roles] of [
      ["/api/v1/admin/users", listAdminUsers, [fresh, root]],
      ["/api/v1/admin/billing/payments", listAdminPayments, [fresh, root, finance]],
      ["/api/v1/admin/overview", adminOverview, [fresh, root, finance, analyst]],
    ] as const) {
      await expectCode(await handler(read(route)), 401, "UNAUTHENTICATED");
      for (const cookie of [owner, analyst, finance, fresh, root]) {
        const response = await handler(read(route, cookie));
        if (roles.includes(cookie)) {
          assert.equal(response.status, 200, `${route}: authorized role must succeed`);
          assert.equal(response.headers.get("Cache-Control"), "private, no-store, max-age=0");
        } else await expectCode(response, 403, "SYSTEM_ROLE_REQUIRED");
      }
    }
    const detail = (cookie: string, id: string) => readAdminUser(
      read(`/api/v1/admin/users/${id}`, cookie), { params: Promise.resolve({ id }) });
    await expectCode(await detail(owner, ids.target), 403, "SYSTEM_ROLE_REQUIRED");
    await expectCode(await detail(finance, ids.target), 403, "SYSTEM_ROLE_REQUIRED");
    await expectCode(await detail(analyst, ids.target), 403, "SYSTEM_ROLE_REQUIRED");
    assert.equal((await detail(fresh, ids.target)).status, 200);
    assert.equal((await detail(root, ids.target)).status, 200);
    await expectCode(await detail(fresh, "nonexistent_" + suffix), 404, "USER_NOT_FOUND");
    console.log("ADMIN_ROLE_MATRIX_QA_PASS: anonymous, workspace OWNER, ANALYST, FINANCE, ADMIN, SUPER_ADMIN; 401/403/404, private response, signed sessions");
    assert.equal(await prisma.userAccessState.count({ where: { userId: ids.target } }), 0,
      "Rejected actions must not mutate user state");

    const role = await prisma.systemRoleAssignment.findFirstOrThrow({ where: { userId: ids.admin } });
    await prisma.systemRoleAssignment.update({ where: { id: role.id }, data: { revokedAt: new Date() } });
    await expectCode(await change(fresh), 403, "SYSTEM_ROLE_REQUIRED");
    await prisma.systemRoleAssignment.update({ where: { id: role.id }, data: { revokedAt: null } });
    await prisma.userAccessState.create({ data: {
      userId: ids.admin, status: "SUSPENDED", reason: "QA actor suspension",
    } });
    await expectCode(await change(fresh), 403, "ACCOUNT_DISABLED");
    await prisma.userAccessState.delete({ where: { userId: ids.admin } });

    const privileged = await changeAccess(mutation("PATCH",
      "/api/v1/admin/users/" + ids.root + "/access",
      { status: "SUSPENDED", reason }, fresh),
      { params: Promise.resolve({ id: ids.root }) });
    await expectCode(privileged, 403, "PROTECTED_ADMIN");
    const suspended = await change(fresh);
    assert.equal(suspended.status, 200, "Fresh signed session suspends ordinary user");
    assert.equal((await prisma.userAccessState.findUniqueOrThrow({
      where: { userId: ids.target },
    })).status, "SUSPENDED");
    assert.equal(await prisma.session.count({ where: { userId: ids.target } }), 0,
      "Suspension revokes all target sessions");
    assert.equal(await auth.api.getSession({ headers: new Headers({ cookie: targetSession }) }), null,
      "Revoked signed session must not authenticate");
    assert.equal((await prisma.adminAuditLog.findMany({ where: {
      resourceType: "USER", resourceId: ids.target, action: "USER_ACCESS_CHANGE",
    } })).length, 1);
    const active = await change(fresh, "ACTIVE");
    assert.equal(active.status, 200, "Fresh signed session reactivates user");
    assert.equal(await prisma.session.count({ where: { userId: ids.target } }), 0,
      "Reactivation must not recreate a session");

    const proposalBody = { period: "MONTH", reason, idempotencyKey: "qasess_" + suffix };
    const propose = (cookie: string, body = proposalBody) =>
      proposeGrant(mutation("POST", grantPath, body, cookie), grantParams);
    await expectCode(await propose(analyst), 403, "SYSTEM_ROLE_REQUIRED");
    const proposal = await propose(fresh);
    assert.equal(proposal.status, 202);
    grantActionId = (await proposal.json()).data.id;
    assert.equal((await propose(fresh)).status, 202, "Duplicate request is safely replayed");
    assert.equal(await prisma.subscriptionActionRequest.count({ where: { userId: ids.target } }), 1);
    await expectCode(await propose(fresh, { ...proposalBody, period: "YEAR" }), 409, "IDEMPOTENCY_CONFLICT");
    assert.equal(await prisma.subscriptionGrant.count({ where: { userId: ids.target } }), 0,
      "A proposal alone never grants Premium");
    const decisionPath = "/api/v1/admin/subscriptions/actions/" + grantActionId + "/decision";
    const decisionParams = { params: Promise.resolve({ id: grantActionId }) };
    const decide = (cookie: string) => decideGrant(mutation("POST", decisionPath,
      { decision: "APPROVE", reason }, cookie), decisionParams);
    await expectCode(await decide(fresh), 403, "SYSTEM_ROLE_REQUIRED");
    assert.equal((await decide(root)).status, 200, "Separate Super Admin approves");
    assert.equal((await decide(root)).status, 200, "Same reviewer may safely retry");
    assert.equal(await prisma.subscriptionGrant.count({ where: { userId: ids.target } }), 1);
    assert.equal(await prisma.subscriptionEvent.count({ where: { userId: ids.target } }), 1);
    assert.equal((await prisma.subscription.findUniqueOrThrow({
      where: { userId: ids.target },
    })).planCode, "PREMIUM");
    assert.equal((await prisma.adminAuditLog.count({ where: {
      resourceType: "SUBSCRIPTION_ACTION", resourceId: grantActionId,
    } })), 2, "Proposal and decision have one audit entry each");
    assert.equal((await prisma.adminAuditLog.count({ where: {
      resourceType: "USER", resourceId: ids.target, action: "USER_ACCESS_CHANGE",
    } })), 2, "Suspend and reactivate are both audited");
    const grant = await prisma.subscriptionGrant.findFirstOrThrow({ where: { userId: ids.target } });
    const revokePath = "/api/v1/admin/subscriptions/" + grant.id + "/revoke";
    const revokeParams = { params: Promise.resolve({ id: grant.id }) };
    const revokeBody = { reason, idempotencyKey: "qasess_revoke_" + suffix };
    const revoke = (cookie: string, body = revokeBody) =>
      proposeRevoke(mutation("POST", revokePath, body, cookie), revokeParams);
    await expectCode(await revoke(analyst), 403, "SYSTEM_ROLE_REQUIRED");
    const proposedRevoke = await revoke(fresh);
    assert.equal(proposedRevoke.status, 202);
    revokeActionId = (await proposedRevoke.json()).data.id;
    assert.equal((await revoke(fresh)).status, 202, "Revoke proposal replay is idempotent");
    assert.equal((await prisma.subscriptionGrant.findUniqueOrThrow({ where: { id: grant.id } })).revokedAt, null,
      "Revoke proposal cannot disable Premium before review");
    const revokeDecisionParams = { params: Promise.resolve({ id: revokeActionId }) };
    const revokeDecisionPath = "/api/v1/admin/subscriptions/actions/" + revokeActionId + "/decision";
    const approveRevoke = (cookie: string) => decideGrant(mutation("POST", revokeDecisionPath,
      { decision: "APPROVE", reason }, cookie), revokeDecisionParams);
    await expectCode(await approveRevoke(fresh), 403, "SYSTEM_ROLE_REQUIRED");
    assert.equal((await approveRevoke(root)).status, 200);
    assert.equal((await approveRevoke(root)).status, 200, "Revoke approval replay is idempotent");
    assert.ok((await prisma.subscriptionGrant.findUniqueOrThrow({ where: { id: grant.id } })).revokedAt);
    assert.equal(await prisma.subscriptionEvent.count({ where: { userId: ids.target, kind: "GRANT_REVOKED" } }), 1);
    assert.equal((await prisma.subscription.findUniqueOrThrow({ where: { userId: ids.target } })).planCode, "LITE");
    assert.equal(await prisma.adminAuditLog.count({ where: { resourceType: "SUBSCRIPTION_ACTION",
      resourceId: revokeActionId } }), 2, "Revoke proposal and approval are audited exactly once");
    console.log("ADMIN_SIGNED_SESSION_QA_PASS: HMAC cookie, stale sign-in despite refreshed updatedAt, origin, roles, revoked actor, privileged IDOR, suspend/reactivate/session revocation, audit, independently approved idempotent grant and revoke");
  } catch (error) {
    testError = error;
    throw error;
  } finally {
    try {
      await prisma.subscriptionEvent.deleteMany({ where: { userId: ids.target } });
      await prisma.subscriptionActionRequest.deleteMany({ where: { userId: ids.target } });
      await prisma.subscriptionGrant.deleteMany({ where: { userId: ids.target } });
      await prisma.subscription.deleteMany({ where: { userId: ids.target } });
      await prisma.adminAuditLog.deleteMany({ where: {
        OR: [{ actorId: { in: users } }, { resourceId: { in: users } },
          ...(grantActionId ? [{ resourceId: grantActionId }] : []),
          ...(revokeActionId ? [{ resourceId: revokeActionId }] : [])],
      } });
      await prisma.session.deleteMany({ where: { userId: { in: users } } });
      await prisma.membership.deleteMany({ where: { workspaceId } });
      await prisma.workspace.deleteMany({ where: { id: workspaceId } });
      await prisma.userAccessState.deleteMany({ where: { userId: { in: users } } });
      await prisma.systemRoleAssignment.deleteMany({ where: { userId: { in: users } } });
      await prisma.user.deleteMany({ where: { id: { in: users } } });
      assert.equal(await prisma.user.count({ where: { id: { in: users } } }), 0,
        "All signed-session QA users must be removed");
    } catch (cleanupError) {
      if (!testError) throw cleanupError;
      console.error("Signed-session QA cleanup also failed; original test error preserved:", cleanupError);
    }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
