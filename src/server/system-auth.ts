import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/server/auth";
import { HttpError } from "@/server/context";
import { limitSystemRequest } from "@/server/rate-limit";
import type { SystemRole } from "@finova/prisma";

export const systemAdminEnabled = () => process.env.FINOVA_ADMIN_ENABLED === "1";
export type SystemActor = { userId: string; role: SystemRole };

/** A fresh Google sign-in creates a new Better Auth session. Do not use the
 * mutable session.updatedAt: background refreshes must not extend step-up. */
export function assertRecentAdminSignIn(createdAt: Date | string | undefined, now = Date.now()) {
  const signedInAt = createdAt instanceof Date ? createdAt.getTime() :
    typeof createdAt === "string" ? new Date(createdAt).getTime() : NaN;
  const age = now - signedInAt;
  if (!Number.isFinite(age) || age < -60_000 || age > 5 * 60_000) {
    throw new HttpError(403, "REAUTH_REQUIRED",
      "Cần đăng nhập Google lại trong 5 phút gần nhất để thay đổi trạng thái tài khoản.");
  }
}

export async function requireSystemRole(allowed: readonly SystemRole[], request?: NextRequest,
  options?: { recentSignIn?: boolean }): Promise<SystemActor> {
  if (!systemAdminEnabled()) throw new HttpError(503, "ADMIN_DISABLED", "Quản trị hệ thống đang tạm đóng.");
  const session = await auth.api.getSession({ headers: request?.headers ?? await headers() });
  if (!session) throw new HttpError(401, "UNAUTHENTICATED", "Vui lòng đăng nhập.");
  const [state, assignments] = await Promise.all([
    prisma.userAccessState.findUnique({ where: { userId: session.user.id }, select: { status: true } }),
    prisma.systemRoleAssignment.findMany({ where: { userId: session.user.id, revokedAt: null }, select: { role: true } }),
  ]);
  if (state && state.status !== "ACTIVE") throw new HttpError(403, "ACCOUNT_DISABLED", "Tài khoản đang bị khóa.");
  // Prefer the strongest allowed role when a user has more than one assignment.
  const role = allowed.find(r => assignments.some(a => a.role === r));
  if (!role) throw new HttpError(403, "SYSTEM_ROLE_REQUIRED", "Không có quyền quản trị hệ thống.");
  if (options?.recentSignIn) assertRecentAdminSignIn(session.session?.createdAt);
  if (request) await limitSystemRequest(session.user.id, request);
  return { userId: session.user.id, role };
}

export const allReportingRoles = ["SUPER_ADMIN", "ADMIN", "FINANCE_OPERATOR", "ANALYST"] as const;
export const userManagementRoles = ["SUPER_ADMIN", "ADMIN"] as const;
