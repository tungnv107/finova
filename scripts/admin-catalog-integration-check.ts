/** Isolated PostgreSQL integration test for Admin pricing lifecycle and constraints. */
import { randomBytes, randomUUID } from "node:crypto";
import { prisma } from "../src/lib/db";
import { HttpError } from "../src/server/context";
import { seedPremiumCatalogAndLiteSubscriptions } from "../src/modules/billing/seed";
import {
  assertDraftAmount, assertPremiumProductCode, createPriceDraft, deletePriceDraft,
  listAdminPriceVersions, publishPriceDraft, unpublishPrice, updatePriceDraft,
} from "../src/modules/billing/catalog-admin";
import {
  approveReceivingAccount, createBillingOrder, getPublishedPrices,
  proposeReceivingAccount,
} from "../src/modules/billing/service";

function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`CATALOG_QA_FAILED: ${message}`);
}

async function rejects(label: string, action: () => unknown | Promise<unknown>, status?: number | "DB_CONSTRAINT") {
  try { await action(); } catch (error) {
    if (typeof status === "number") {
      check(error instanceof HttpError && error.status === status, `${label}: wrong HTTP status`);
    } else if (status === "DB_CONSTRAINT") {
      const actualCode = (error as { meta?: { code?: string } })?.meta?.code;
      const unknownConnectorCode = /PostgresError\s*\{\s*code:\s*"(23514|23503|23505)"/.test(String(error));
      check(unknownConnectorCode || actualCode === "23514" || actualCode === "23503" || actualCode === "23505" ||
        (error as { code?: string })?.code === "P2002" || (error as { code?: string })?.code === "P2003" ||
        (error as { code?: string })?.code === "P2004", `${label}: wrong DB error ${actualCode ?? String(error)}`);
    }
    return;
  }
  throw new Error(`CATALOG_QA_FAILED: unexpectedly accepted ${label}`);
}

async function main() {
  const db = new URL(process.env.DATABASE_URL ?? "postgres://invalid/invalid").pathname;
  check(/^\/finova_admin_test_catalog_[a-zA-Z0-9_]+$/.test(db), "isolated catalog QA database required");
  process.env.FINOVA_ADMIN_ENABLED = "1";
  process.env.FINOVA_BILLING_CHECKOUT_ENABLED = "1";
  process.env.FINOVA_BILLING_ENCRYPTION_KEY = randomBytes(32).toString("hex");

  const migrationNames = await prisma.$queryRaw<{ migration_name: string }[]>`
    SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL
  `;
  for (const name of ["20261024134500_admin_access_constraints", "20261024140000_admin_catalog_integrity"]) {
    check(migrationNames.some(m => m.migration_name === name), `${name} applied`);
  }
  const suffix = randomUUID().replaceAll("-", "");
  const [owner, other, member] = ["owner", "other", "member"].map(p => `${p}_${suffix}`);
  await prisma.user.createMany({ data: [owner, other, member].map(id => ({
    id, name: id, email: `${id}@example.test`, emailVerified: true,
  })) });
  const admin = { userId: owner, role: "SUPER_ADMIN" as const };
  const approver = { userId: other, role: "SUPER_ADMIN" as const };
  const readonly = { userId: member, role: "ANALYST" as const };
  const role = await prisma.systemRoleAssignment.create({ data: { userId: owner, role: "ADMIN" } });
  await rejects("duplicate active role", () => prisma.systemRoleAssignment.create({
    data: { userId: owner, role: "ADMIN" },
  }), "DB_CONSTRAINT");
  await prisma.systemRoleAssignment.update({ where: { id: role.id }, data: { revokedAt: new Date() } });
  await prisma.systemRoleAssignment.create({ data: { userId: owner, role: "ADMIN" } });
  await rejects("blank audit reason fields", () => prisma.adminAuditLog.create({
    data: { actorId: owner, action: "  ", resourceType: "PLAN_PRICE", resourceId: "bad" },
  }), "DB_CONSTRAINT");
  await seedPremiumCatalogAndLiteSubscriptions();

  await rejects("unauthorized catalog read", () => listAdminPriceVersions(readonly), 403);
  await rejects("unauthorized draft create", () => createPriceDraft(readonly, "PREMIUM_MONTHLY", 39000), 403);
  for (const product of ["constructor", "toString", "__proto__", "PREMIUM_WEEKLY", ""]) {
    await rejects(`invalid product ${product}`, () => assertPremiumProductCode(product), 422);
  }
  for (const amount of [0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity]) {
    await rejects(`invalid amount ${amount}`, () => assertDraftAmount(amount), 422);
  }

  const monthlyOld = await prisma.planPrice.findFirstOrThrow({
    where: { productCode: "PREMIUM_MONTHLY", isPublished: true },
  });
  check(Number(monthlyOld.priceVnd) === 29000, "original monthly price");
  const receiver = await proposeReceivingAccount(admin, {
    bankCode: "QA", bankName: "QA Bank", accountName: "FINOVA QA", accountNumber: "123456789012",
  });
  await approveReceivingAccount(approver, receiver.id);
  const oldOrder = await createBillingOrder(member, monthlyOld.id, `PRICING_OLD_${suffix}`);
  check(oldOrder.amountVnd === 29000, "original order snapshot");

  const disposable = await createPriceDraft(admin, "PREMIUM_YEARLY", 209000);
  await updatePriceDraft(admin, disposable.id, 219000);
  check((await listAdminPriceVersions(admin)).some(p => p.id === disposable.id && p.priceVnd === 219000 && p.lifecycle === "DRAFT"),
    "updated draft appears in admin list");
  await deletePriceDraft(admin, disposable.id);
  check(!(await prisma.planPrice.findUnique({ where: { id: disposable.id } })), "draft deletion");

  const draft = await createPriceDraft(admin, "PREMIUM_MONTHLY", 40000);
  await updatePriceDraft(admin, draft.id, 39000);
  await rejects("SQL draft price check", () => prisma.$executeRaw`
    UPDATE "PlanPrice" SET "priceVnd" = 0 WHERE "id" = ${draft.id}
  `, "DB_CONSTRAINT");
  await rejects("SQL two simultaneously published versions", () => prisma.$executeRaw`
    UPDATE "PlanPrice" SET "isPublished" = true, "publishedAt" = NOW() WHERE "id" = ${draft.id}
  `, "DB_CONSTRAINT");
  await rejects("cannot publish as analyst", () => publishPriceDraft(readonly, draft.id), 403);
  const published = await publishPriceDraft(admin, draft.id);
  check(published.lifecycle === "PUBLISHED" && published.version === monthlyOld.version + 1, "version published");
  const originalAfter = await prisma.planPrice.findUniqueOrThrow({ where: { id: monthlyOld.id } });
  check(!originalAfter.isPublished && originalAfter.publishedAt !== null && originalAfter.effectiveTo !== null,
    "previous published price is archived with history");
  await rejects("republish archived price", () => publishPriceDraft(admin, monthlyOld.id), 409);
  await rejects("edit archived price", () => updatePriceDraft(admin, monthlyOld.id, 41000), 409);
  await rejects("delete archived price", () => deletePriceDraft(admin, monthlyOld.id), 409);
  await rejects("edit published price", () => updatePriceDraft(admin, draft.id, 41000), 409);
  await rejects("delete published price", () => deletePriceDraft(admin, draft.id), 409);

  const current = (await getPublishedPrices()).find(p => p.productCode === "PREMIUM_MONTHLY");
  check(current?.priceVnd === 39000 && current.id === draft.id, "new checkout gets new price");
  const newOrder = await createBillingOrder(member, draft.id, `PRICING_NEW_${suffix}`);
  const again = await createBillingOrder(member, draft.id, `PRICING_NEW_${suffix}`);
  check(newOrder.id === again.id && newOrder.amountVnd === 39000, "new order idempotency and price snapshot");
  const storedOldOrder = await prisma.billingOrder.findUniqueOrThrow({ where: { id: oldOrder.id } });
  check(Number(storedOldOrder.amountDueVnd) === 29000 && storedOldOrder.priceId === monthlyOld.id,
    "old order retains original immutable commercial terms");
  await rejects("checkout archived price", () => createBillingOrder(member, monthlyOld.id, `PRICING_ARCHIVED_${suffix}`), 422);

  // Direct SQL must also reject any change to commercial terms or deletion of published history.
  await rejects("SQL edit published history", () => prisma.$executeRaw`
    UPDATE "PlanPrice" SET "priceVnd" = 1 WHERE "id" = ${monthlyOld.id}
  `, "DB_CONSTRAINT");
  await rejects("SQL delete published history", () => prisma.$executeRaw`
    DELETE FROM "PlanPrice" WHERE "id" = ${monthlyOld.id}
  `, "DB_CONSTRAINT");
  await rejects("SQL invalid published amount", () => prisma.$executeRaw`
    UPDATE "PlanPrice" SET "priceVnd" = 0 WHERE "id" = ${draft.id}
  `, "DB_CONSTRAINT");
  await rejects("SQL orphan entitlement", () => prisma.$executeRaw`
    INSERT INTO "PlanEntitlement" ("id", "planCode", "featureKey", "enabled", "policyVersion")
    VALUES (${`orphan_${suffix}`}, 'MISSING', 'BANK_SYNC', true, 1)
  `, "DB_CONSTRAINT");
  await rejects("SQL invalid policy version", () => prisma.$executeRaw`
    UPDATE "PlanEntitlement" SET "policyVersion" = 0 WHERE "planCode" = 'PREMIUM'
  `, "DB_CONSTRAINT");
  await rejects("SQL duplicate active published price", () => prisma.$executeRaw`
    UPDATE "PlanPrice" SET "isPublished" = true WHERE "id" = ${monthlyOld.id}
  `, "DB_CONSTRAINT");

  // Concurrency: two admins may publish drafts in either order; at most one remains open.
  const draftA = await createPriceDraft(admin, "PREMIUM_MONTHLY", 41000);
  const draftB = await createPriceDraft(approver, "PREMIUM_MONTHLY", 42000);
  const concurrent = await Promise.allSettled([
    publishPriceDraft(admin, draftA.id), publishPriceDraft(approver, draftB.id),
  ]);
  check(concurrent.some(r => r.status === "fulfilled"), "at least one concurrent publish succeeds");
  const available = await prisma.planPrice.findMany({ where: { productCode: "PREMIUM_MONTHLY", isPublished: true } });
  check(available.length === 1, "single published price under concurrent publish");
  const audit = await prisma.adminAuditLog.findMany({ where: { actorId: { in: [owner, other] }, resourceType: "PLAN_PRICE" } });
  for (const action of ["PRICE_DRAFT_CREATE", "PRICE_DRAFT_UPDATE", "PRICE_DRAFT_DELETE", "PRICE_PUBLISH"]) {
    check(audit.some(row => row.action === action), `audit ${action}`);
  }
  const activeId = available[0].id;
  const actorForActive = activeId === draftB.id ? approver : admin;
  const ended = await unpublishPrice(actorForActive, activeId);
  check(ended.lifecycle === "ARCHIVED", "unpublished price archived");
  check(!(await getPublishedPrices()).some(p => p.productCode === "PREMIUM_MONTHLY"), "no monthly product available after unpublish");
  await rejects("republish unpublished price", () => publishPriceDraft(admin, activeId), 409);
  await rejects("delete unpublished price", () => deletePriceDraft(admin, activeId), 409);
  check(await prisma.adminAuditLog.count({ where: { resourceId: activeId, action: "PRICE_UNPUBLISH" } }) === 1,
    "unpublish audited");
  check((await prisma.billingOrder.findUniqueOrThrow({ where: { id: oldOrder.id } })).amountDueVnd.toString() === "29000",
    "historic order snapshot unchanged after subsequent repricing");

  console.log(`CATALOG_QA_PASS: 2 new migrations, RBAC, validation, draft CRUD, repricing, order snapshots, idempotency, immutable SQL history, constraints, concurrent publish, unpublish, audit. QA database: ${db}`);
}

main().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
