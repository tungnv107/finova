import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { assertUserActive, HttpError, requireContext, userAccessEnforced } from "@/server/context";
import type { UserContext } from "@/server/context";
import { featureAllowed, type PremiumFeature } from "@/modules/billing/domain";
import type { Prisma } from "@finova/prisma";

/** Keep enforcement off until the migration, bank reconciliation and existing-user transition are approved. */
export const premiumEnforced = () => process.env.FINOVA_ADMIN_ENABLED === "1" && process.env.FINOVA_PREMIUM_ENTITLEMENTS_ENFORCED === "1";

export async function getEffectiveSubscription(userId: string, now = new Date()) {
  if (process.env.FINOVA_ADMIN_ENABLED !== "1") return { plan: "LITE" as const, expiresAt: null as Date | null };
  const grants = await prisma.subscriptionGrant.findMany({ where: { userId, startsAt: { lte: now }, expiresAt: { gt: now }, revokedAt: null },
    select: { expiresAt: true }, orderBy: { expiresAt: "desc" } });
  return { plan: (grants.length ? "PREMIUM" : "LITE") as "LITE" | "PREMIUM", expiresAt: grants[0]?.expiresAt ?? null };
}

export async function requirePremiumFeature(userId: string, feature: PremiumFeature) {
  if (!premiumEnforced()) return;
  const { plan } = await getEffectiveSubscription(userId);
  if (!featureAllowed(plan, feature)) throw new HttpError(403, "PREMIUM_REQUIRED", "Cần gói Premium để sử dụng tính năng này.");
}

/** Recheck within the transaction that writes canonical bank data or notifications. */
export async function requireWorkspacePremiumInDb(
  db: Prisma.TransactionClient, workspaceId: string, feature: PremiumFeature, now = new Date(),
) {
  if (!premiumEnforced() && !userAccessEnforced()) return;
  const workspace = await db.workspace.findUnique({ where: { id: workspaceId }, select: { createdById: true } });
  if (!workspace) throw new HttpError(404, "WORKSPACE_NOT_FOUND", "Không tìm thấy không gian tài chính.");
  if (userAccessEnforced()) {
    const state = await db.userAccessState.findUnique({ where: { userId: workspace.createdById }, select: { status: true } });
    if (state && state.status !== "ACTIVE") throw new HttpError(403, "ACCOUNT_DISABLED", "Tài khoản đang bị khóa.");
  }
  if (!premiumEnforced()) return;
  const grant = await db.subscriptionGrant.findFirst({ where: {
    userId: workspace.createdById, startsAt: { lte: now }, expiresAt: { gt: now }, revokedAt: null,
  }, select: { id: true } });
  if (!grant) throw new HttpError(403, "PREMIUM_REQUIRED", "Đồng bộ tạm dừng vì gói Premium hết hạn.");
}

/** System jobs use the personal workspace owner, never a synthetic SYSTEM user. */
export async function requireWorkspacePremium(workspaceId: string, feature: PremiumFeature) {
  if (!premiumEnforced() && !userAccessEnforced()) return;
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { createdById: true } });
  if (!workspace) throw new HttpError(404, "WORKSPACE_NOT_FOUND", "Không tìm thấy không gian tài chính.");
  await assertUserActive(workspace.createdById);
  await requirePremiumFeature(workspace.createdById, feature);
}

export async function hasPremiumFeature(userId: string, feature: PremiumFeature) {
  if (!premiumEnforced()) return true;
  return featureAllowed((await getEffectiveSubscription(userId)).plan, feature);
}

async function requireFeatureContext(feature: PremiumFeature, request?: NextRequest): Promise<UserContext> {
  const context = await requireContext(request);
  await requirePremiumFeature(context.userId, feature);
  return context;
}
export const requireStatementImportContext = (request?: NextRequest) => requireFeatureContext("STATEMENT_IMPORT", request);
export const requireBankSyncContext = (request?: NextRequest) => requireFeatureContext("BANK_SYNC", request);
export const requireNotificationsContext = (request?: NextRequest) => requireFeatureContext("NOTIFICATIONS", request);
