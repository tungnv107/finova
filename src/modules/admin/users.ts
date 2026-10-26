import { prisma } from "@/lib/db";
import { HttpError } from "@/server/context";
import { serializable } from "@/server/serializable";
import type { SystemActor } from "@/server/system-auth";
import type { Prisma, UserAccessStatus } from "@finova/prisma";
import { assertAccessChangeAllowed } from "./access-policy";
import { sanitizeOperatorReason } from "./privacy";
import { decodeAdminUserCursor, encodeAdminUserCursor, normalizeAdminUserFilters } from "./user-pagination";

export const userPageSize = 30;

function adminUserWhere(input: { q: string; status?: UserAccessStatus }): Prisma.UserWhereInput {
  const { q } = input;
  const search = q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { email: { contains: q, mode: "insensitive" as const } }] } : {};
  // Missing UserAccessState rows are active. Explicit filters include that default.
  return input.status === "ACTIVE" ? { AND: [search,
    { OR: [{ accessState: { is: null } }, { accessState: { is: { status: "ACTIVE" as const } } }] }] } :
    input.status ? { ...search, accessState: { is: { status: input.status } } } : search;
}

function adminUserSelect(now: Date) {
  return { id: true, name: true, email: true, createdAt: true,
    accessState: { select: { status: true } },
    subscriptionGrants: { where: { startsAt: { lte: now }, expiresAt: { gt: now }, revokedAt: null },
      orderBy: { expiresAt: "desc" as const }, take: 1, select: { expiresAt: true } },
  } as const;
}

function projectAdminUser<T extends { id: string; name: string; email: string; createdAt: Date;
  accessState: { status: UserAccessStatus } | null; subscriptionGrants: { expiresAt: Date }[] }>(u: T) {
  return { id: u.id, name: u.name, email: u.email, createdAt: u.createdAt,
    accessState: u.accessState?.status ?? "ACTIVE" as const,
    plan: u.subscriptionGrants.length ? "PREMIUM" as const : "LITE" as const,
    premiumExpiresAt: u.subscriptionGrants[0]?.expiresAt ?? null };
}

export async function listAdminUsers(input: { q?: string; cursor?: string; status?: UserAccessStatus }) {
  const filters = normalizeAdminUserFilters(input);
  const cursor = decodeAdminUserCursor(input.cursor, filters);
  const direction = cursor?.direction ?? "after";
  const filter = adminUserWhere(filters);
  const pivot: Prisma.UserWhereInput | undefined = cursor ? { OR: direction === "after" ? [
    { createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { gt: cursor.id } },
  ] : [
    { createdAt: { gt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } },
  ] } : undefined;
  const now = new Date();
  const [total, users] = await Promise.all([
    prisma.user.count({ where: filter }),
    prisma.user.findMany({ where: pivot ? { AND: [filter, pivot] } : filter,
      take: userPageSize + 1,
      orderBy: direction === "after" ? [{ createdAt: "desc" }, { id: "asc" }] :
        [{ createdAt: "asc" }, { id: "desc" }],
      select: adminUserSelect(now) }),
  ]);
  const hasOverflow = users.length > userPageSize;
  const visible = (hasOverflow ? users.slice(0, userPageSize) : users);
  if (direction === "before") visible.reverse();
  const hasPrevious = direction === "before" ? hasOverflow : !!cursor;
  const hasNext = direction === "before" ? !!cursor : hasOverflow;
  return { total, pageSize: userPageSize, users: visible.map(projectAdminUser),
    previousCursor: hasPrevious && visible[0] ? encodeAdminUserCursor(visible[0], "before", filters) : null,
    nextCursor: hasNext && visible.length ? encodeAdminUserCursor(visible[visible.length - 1], "after", filters) : null };
}

/** Explicit, bounded PII export for Super Admin. Reject broad filters instead of silently truncating. */
export async function exportAdminUsers(actor: SystemActor, input: { q?: string; status?: UserAccessStatus }) {
  if (actor.role !== "SUPER_ADMIN") throw new HttpError(403, "SYSTEM_ROLE_REQUIRED", "Chỉ Super Admin được xuất hồ sơ người dùng.");
  const filters = normalizeAdminUserFilters(input);
  const users = await prisma.user.findMany({ where: adminUserWhere(filters), take: 501,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }], select: adminUserSelect(new Date()) });
  if (users.length > 500) throw new HttpError(422, "EXPORT_TOO_BROAD", "Tối đa 500 tài khoản mỗi lần xuất. Hãy thu hẹp bộ lọc.");
  const cell = (value: string) => {
    const safe = /^[\s]*[=+@\-\t\r]/u.test(value) ? `'${value}` : value;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  const rows = users.map(projectAdminUser).map(u => [u.id, u.name, u.email,
    u.createdAt.toISOString(), u.accessState, u.plan, u.premiumExpiresAt?.toISOString() ?? ""]);
  const csv = ["ID", "Tên", "Email", "Ngày tạo UTC", "Trạng thái", "Gói", "Hết hạn Premium UTC"];
  const bytes = new TextEncoder().encode(`\uFEFF${[csv, ...rows].map(row => row.map(cell).join(",")).join("\r\n")}\r\n`);
  await prisma.adminAuditLog.create({ data: { actorId: actor.userId, action: "ADMIN_USERS_EXPORT",
    resourceType: "USER_LIST", resourceId: "CSV", afterJson: {
      count: users.length, status: filters.status ?? "ALL", filteredByText: !!filters.q,
    } } });
  return bytes;
}

export async function getAdminUser(id: string) {
  const now = new Date();
  const [user, activeGrant, accessEvents] = await Promise.all([prisma.user.findUnique({ where: { id }, select: {
    id: true, name: true, email: true, createdAt: true, updatedAt: true,
    accessState: { select: { status: true, updatedAt: true } },
    systemRoles: { where: { revokedAt: null }, select: { role: true } },
    sessions: { orderBy: { updatedAt: "desc" }, take: 1, select: { updatedAt: true } },
    usageDays: { orderBy: { dayVn: "desc" }, take: 1, select: { lastSeenAt: true } },
    subscriptionEvents: { orderBy: { createdAt: "desc" }, take: 25,
      select: { id: true, kind: true, createdAt: true, startsAt: true, expiresAt: true } },
    subscriptionGrants: { orderBy: { createdAt: "desc" }, take: 25,
      select: { id: true, grantType: true, startsAt: true, expiresAt: true, revokedAt: true, createdAt: true } },
    billingOrders: { orderBy: { createdAt: "desc" }, take: 25,
      select: { id: true, orderCode: true, status: true, amountDueVnd: true, createdAt: true, paidAt: true } },
  } }), prisma.subscriptionGrant.findFirst({ where: { userId: id, revokedAt: null, startsAt: { lte: now }, expiresAt: { gt: now } },
    orderBy: { expiresAt: "desc" }, select: { expiresAt: true } }),
  prisma.adminAuditLog.findMany({ where: { resourceType: "USER", resourceId: id, action: "USER_ACCESS_CHANGE" },
    orderBy: { createdAt: "desc" }, take: 25,
    select: { id: true, createdAt: true, afterJson: true } })]);
  if (!user) throw new HttpError(404, "USER_NOT_FOUND", "Không tìm thấy tài khoản.");
  return { ...user,
    plan: activeGrant ? "PREMIUM" as const : "LITE" as const,
    premiumExpiresAt: activeGrant?.expiresAt ?? null,
    accessState: user.accessState ?? { status: "ACTIVE" as const, updatedAt: null },
    lastSessionAt: user.sessions[0]?.updatedAt ?? null,
    lastSeenAt: [user.sessions[0]?.updatedAt, user.usageDays[0]?.lastSeenAt]
      .filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
    accessEvents: accessEvents.map(e => ({ id: e.id, createdAt: e.createdAt,
      status: e.afterJson && typeof e.afterJson === "object" && !Array.isArray(e.afterJson) &&
        "status" in e.afterJson &&
        ["ACTIVE", "SUSPENDED", "DEACTIVATED"].includes(String(e.afterJson.status)) ?
        String(e.afterJson.status) : "UPDATED" })),
    billingOrders: user.billingOrders.map(o => ({ ...o, amountDueVnd: Number(o.amountDueVnd) })),
    sessions: undefined,
    usageDays: undefined,
  };
}

/** Privileged admins cannot be disabled by this endpoint; role changes require a separate privileged workflow. */
export async function changeUserAccess(actor: SystemActor, targetId: string, status: UserAccessStatus, reason: string) {
  const cleanedReason = sanitizeOperatorReason(reason);
  if (cleanedReason.length < 10 || cleanedReason.length > 500) {
    throw new HttpError(422, "REASON_REQUIRED", "Lý do phải dài 10–500 ký tự.");
  }
  if (status !== "ACTIVE" && status !== "SUSPENDED" && status !== "DEACTIVATED") {
    throw new HttpError(422, "INVALID_STATUS", "Trạng thái không hợp lệ.");
  }
  return serializable(async db => {
    const target = await db.user.findUnique({ where: { id: targetId }, select: {
      id: true, accessState: { select: { status: true } },
      systemRoles: { where: { revokedAt: null }, select: { role: true } },
    } });
    if (!target) throw new HttpError(404, "USER_NOT_FOUND", "Không tìm thấy tài khoản.");
    assertAccessChangeAllowed(actor, targetId, target.systemRoles.map(r => r.role));
    const before = target.accessState?.status ?? "ACTIVE";
    if (before === status) throw new HttpError(409, "ACCESS_UNCHANGED", "Tài khoản đang ở trạng thái này.");
    await db.userAccessState.upsert({ where: { userId: targetId },
      create: { userId: targetId, status, reason: cleanedReason, changedBy: actor.userId },
      update: { status, reason: cleanedReason, changedBy: actor.userId } });
    if (status !== "ACTIVE") await db.session.deleteMany({ where: { userId: targetId } });
    await db.adminAuditLog.create({ data: { actorId: actor.userId, action: "USER_ACCESS_CHANGE", resourceType: "USER",
      resourceId: targetId, reason: cleanedReason, beforeJson: { status: before }, afterJson: { status } } });
    return { id: targetId, status };
  });
}
