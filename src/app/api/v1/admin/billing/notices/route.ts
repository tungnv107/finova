import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireSystemRole } from "@/server/system-auth";
import { failure, respond } from "@/server/http";

export async function GET(request: NextRequest) {
  try {
    await requireSystemRole(["SUPER_ADMIN", "ADMIN", "FINANCE_OPERATOR"], request);
    const page = Number(request.nextUrl.searchParams.get("page") ?? "0");
    const offset = Number.isSafeInteger(page) ? Math.min(100, Math.max(0, page)) * 30 : 0;
    const where = { status: "PENDING", deadLetteredAt: { not: null } };
    const [total, rows] = await Promise.all([
      prisma.billingOutbox.count({ where }),
      prisma.billingOutbox.findMany({ where, orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: offset, take: 30, select: { id: true, orderId: true, kind: true,
          attemptCount: true, lastErrorCode: true, createdAt: true, nextAttemptAt: true } }),
    ]);
    return respond({ total, page: offset / 30, events: rows });
  } catch (error) { return failure(error); }
}
