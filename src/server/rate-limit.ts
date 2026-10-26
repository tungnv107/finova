import { createHash } from "node:crypto";
import { isIP } from "node:net";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import type { UserContext } from "@/server/context";
import { HttpError } from "@/server/context";

export type RateLimitPolicy = "mutation" | "upload" | "export" | "sync" | "scheduler" | "report" | "auth-global" | "auth-client";

// Fixed one-minute windows, enforced by PostgreSQL's atomic UPSERT.
export const RATE_LIMITS: Record<RateLimitPolicy, number> = {
  mutation: 90,
  upload: 12,
  export: 20,
  sync: 12,
  scheduler: 10,
  report: 120,
  // Shared ceiling even without a trusted ingress. Add per-client limits only with a verified proxy.
  "auth-global": 600,
  "auth-client": 30,
};

export function policyForRequest(request: Pick<NextRequest, "method" | "nextUrl">): RateLimitPolicy | null {
  const path = request.nextUrl.pathname;
  if (path.startsWith("/api/v1/exports/") || path.endsWith("/errors.csv")) return "export";
  if (request.method === "GET" && (path.startsWith("/api/v1/reports/") || path === "/api/v1/transactions")) return "report";
  if (request.method === "GET" || request.method === "HEAD") return null;
  if ((path === "/api/v1/imports/columns" || path === "/api/v1/imports/preview") && request.method === "POST") return "upload";
  if (path.includes("/recurring") && (request.method === "PUT" || path.endsWith("/confirm"))) return "sync";
  if (request.method === "POST" || request.method === "PUT" || request.method === "PATCH" || request.method === "DELETE") return "mutation";
  return null;
}

/** Guard credential/state-producing endpoints and OAuth callbacks, not session polling. */
export function shouldLimitAuthRequest(request: Pick<NextRequest, "method" | "nextUrl">): boolean {
  if (!request.nextUrl.pathname.startsWith("/api/auth/")) return false;
  return request.method === "POST" ||
    (request.method === "GET" && request.nextUrl.pathname.startsWith("/api/auth/callback/"));
}

/**
 * Only trust a single IP header if an operator has configured an ingress that
 * overwrites it and prevents direct access to this app. Never parse X-Forwarded-For.
 */
export function trustedProxyClientIp(headers: Pick<Headers, "get">, configuredHeader = process.env.FINOVA_TRUSTED_CLIENT_IP_HEADER): string | null {
  const header = configuredHeader?.trim().toLowerCase();
  if (header !== "cf-connecting-ip" && header !== "x-real-ip" && header !== "true-client-ip") return null;
  const value = headers.get(header)?.trim() ?? "";
  if (!value || value.includes(",") || !isIP(value)) return null;
  return value.toLowerCase();
}

export async function limitAuthRequest(request: NextRequest): Promise<void> {
  if (!shouldLimitAuthRequest(request)) return;
  // Use the same global quota on all instances; individual IPs need a trusted ingress.
  await consumeRateLimitKey("oauth", "auth-global");
  const ip = trustedProxyClientIp(request.headers);
  if (process.env.FINOVA_TRUSTED_CLIENT_IP_HEADER && !ip) {
    throw new HttpError(503, "PROXY_IP_REQUIRED", "Proxy đăng nhập chưa được cấu hình đúng.");
  }
  if (ip) await consumeRateLimitKey(ip, "auth-client");
}

export async function consumeRateLimitKey(subject: string, policy: RateLimitPolicy): Promise<void> {
  // No raw user IDs or secrets in the quota table.
  const key = createHash("sha256").update(`${policy}:${subject}`).digest("hex");
  const limit = RATE_LIMITS[policy];
  const rows = await prisma.$queryRaw<{ allowed: boolean; retryAfterSeconds: number }[]>`
    WITH attempt AS (
      INSERT INTO "ApiRateLimit" ("key", "windowStart", "count", "expiresAt")
      VALUES (
        ${key},
        date_trunc('minute', CURRENT_TIMESTAMP),
        1,
        date_trunc('minute', CURRENT_TIMESTAMP) + INTERVAL '2 minutes'
      )
      ON CONFLICT ("key", "windowStart")
      DO UPDATE SET "count" = "ApiRateLimit"."count" + 1
      WHERE "ApiRateLimit"."count" < ${limit}
      RETURNING 1
    )
    SELECT EXISTS(SELECT 1 FROM attempt) AS "allowed",
      GREATEST(1, CEIL(EXTRACT(EPOCH FROM (
        date_trunc('minute', CURRENT_TIMESTAMP) + INTERVAL '1 minute' - CURRENT_TIMESTAMP
      ))))::integer AS "retryAfterSeconds"
  `;
  if (!rows[0]?.allowed) {
    throw new HttpError(429, "RATE_LIMITED", "Quá nhiều yêu cầu. Vui lòng thử lại sau ít phút.", rows[0]?.retryAfterSeconds ?? 60);
  }
}

export async function limitAuthenticatedRequest(context: UserContext, request: NextRequest) {
  const policy = policyForRequest(request);
  if (policy) await consumeRateLimitKey(`${context.userId}:${context.workspaceId}`, policy);
}

/** Admin handlers authorize via system roles without creating a personal workspace. */
export async function limitSystemRequest(userId: string, request: NextRequest) {
  const policy = policyForRequest(request);
  if (policy) await consumeRateLimitKey(`system:${userId}`, policy);
}

export async function pruneExpiredRateLimits() {
  return prisma.apiRateLimit.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}
