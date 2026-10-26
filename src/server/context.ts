import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { bootstrapPersonalWorkspace } from "@/server/bootstrap";
import { limitAuthenticatedRequest } from "@/server/rate-limit";
import { prisma } from "@/lib/db";

export type UserContext = { userId: string; workspaceId: string; name: string; image: string | null };

/** Keep account suspension in effect when the Admin UI is rolled back after migration. */
export const userAccessEnforced = () => process.env.FINOVA_ADMIN_ENABLED === "1" || process.env.FINOVA_USER_ACCESS_ENFORCED === "1";

export async function getContext(request?: NextRequest): Promise<UserContext | null> {
  const session = await auth.api.getSession({ headers: request?.headers ?? await headers() });
  if (!session) return null;
  const user = session.user;
  await assertUserActive(user.id);
  const workspaceId = await bootstrapPersonalWorkspace(user);
  return { userId: user.id, workspaceId, name: user.name, image: user.image ?? null };
}

export async function requireContext(request?: NextRequest): Promise<UserContext> {
  const context = await getContext(request);
  if (!context) throw new HttpError(401, "UNAUTHENTICATED", "Vui lòng đăng nhập với Google.");
  await assertUserActive(context.userId);
  if (request) await limitAuthenticatedRequest(context, request);
  return context;
}

/** Global account restrictions must apply to every authenticated API, independently of workspace ownership. */
export async function assertUserActive(userId: string) {
  if (!userAccessEnforced()) return;
  const state = await prisma.userAccessState.findUnique({ where: { userId }, select: { status: true } });
  if (state && state.status !== "ACTIVE") {
    throw new HttpError(403, "ACCOUNT_DISABLED", "Tài khoản đã bị tạm khóa. Vui lòng liên hệ hỗ trợ.");
  }
}

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public retryAfterSeconds?: number) { super(message); }
}
