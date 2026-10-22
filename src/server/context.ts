import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { bootstrapPersonalWorkspace } from "@/server/bootstrap";
import { limitAuthenticatedRequest } from "@/server/rate-limit";

export type UserContext = { userId: string; workspaceId: string; name: string; image: string | null };

export async function getContext(): Promise<UserContext | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const user = session.user;
  const workspaceId = await bootstrapPersonalWorkspace(user);
  return { userId: user.id, workspaceId, name: user.name, image: user.image ?? null };
}

export async function requireContext(request?: NextRequest): Promise<UserContext> {
  const context = await getContext();
  if (!context) throw new HttpError(401, "UNAUTHENTICATED", "Vui lòng đăng nhập với Google.");
  if (request) await limitAuthenticatedRequest(context, request);
  return context;
}

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public retryAfterSeconds?: number) { super(message); }
}
