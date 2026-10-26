import { prisma } from "@/lib/db";
import { addVietnamCalendarPeriod } from "@/modules/billing/domain";
import { HttpError } from "@/server/context";
import { serializable } from "@/server/serializable";
import type { SystemActor } from "@/server/system-auth";
import { sanitizeOperatorReason } from "@/modules/admin/privacy";

type Proposal = {
  userId: string;
  kind: "MANUAL_GRANT" | "REVOKE_MANUAL";
  grantId?: string;
  period?: "MONTH" | "YEAR";
  reason: string;
  idempotencyKey: string;
};

function validReason(value: string) {
  const reason = sanitizeOperatorReason(value);
  if (reason.length < 12 || reason.length > 500) {
    throw new HttpError(422, "REASON_REQUIRED", "Cần lý do rõ ràng, dài 12–500 ký tự.");
  }
  return reason;
}

function requireProposer(actor: SystemActor) {
  if (actor.role !== "SUPER_ADMIN" && actor.role !== "ADMIN") {
    throw new HttpError(403, "SYSTEM_ROLE_REQUIRED", "Không có quyền đề xuất điều chỉnh gói.");
  }
}

/** Self-service registration is an application, not a payment acknowledgement.
 * It shares the audited, independent Super Admin decision path with manual grants. */
export async function requestPremiumRegistration(userId: string, period: "MONTH" | "YEAR", idempotencyKey: string) {
  if (process.env.FINOVA_ADMIN_ENABLED !== "1") throw new HttpError(503, "ADMIN_DISABLED", "Đăng ký Premium đang tạm đóng.");
  if (period !== "MONTH" && period !== "YEAR") throw new HttpError(422, "INVALID_PERIOD", "Kỳ hạn không hợp lệ.");
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(idempotencyKey)) throw new HttpError(422, "INVALID_IDEMPOTENCY_KEY", "Mã yêu cầu không hợp lệ.");
  return serializable(async db => {
    const prior = await db.subscriptionActionRequest.findUnique({ where: {
      requestedBy_idempotencyKey: { requestedBy: userId, idempotencyKey },
    } });
    if (prior) {
      if (prior.userId !== userId || prior.kind !== "MANUAL_GRANT" || prior.billingPeriod !== period) {
        throw new HttpError(409, "IDEMPOTENCY_CONFLICT", "Mã yêu cầu đã được sử dụng.");
      }
      return { id: prior.id, status: prior.status, expiresAt: prior.expiresAt };
    }
    const user = await db.user.findUnique({ where: { id: userId }, select: {
      id: true, accessState: { select: { status: true } },
      systemRoles: { where: { revokedAt: null }, select: { id: true }, take: 1 },
    } });
    if (!user || (user.accessState && user.accessState.status !== "ACTIVE")) {
      throw new HttpError(403, "USER_NOT_ACTIVE", "Tài khoản không hoạt động.");
    }
    if (user.systemRoles.length) throw new HttpError(403, "PRIVILEGED_TARGET", "Tài khoản quản trị không đăng ký qua biểu mẫu này.");
    const now = new Date();
    const pending = await db.subscriptionActionRequest.findFirst({ where: {
      userId, requestedBy: userId, kind: "MANUAL_GRANT", status: "PENDING", expiresAt: { gt: now },
    }, select: { id: true } });
    if (pending) throw new HttpError(409, "REGISTRATION_PENDING", "Bạn đã có yêu cầu chờ duyệt. Vui lòng theo dõi trạng thái.");
    const reason = "Người dùng đăng ký Premium; quản trị xác minh điều kiện và thanh toán ngoài hệ thống trước khi duyệt.";
    const request = await db.subscriptionActionRequest.create({ data: {
      userId, kind: "MANUAL_GRANT", billingPeriod: period, periodCount: 1,
      reason, requestedBy: userId, idempotencyKey,
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60_000),
    } });
    await db.adminAuditLog.create({ data: { actorId: userId, action: "PREMIUM_REGISTRATION_REQUESTED",
      resourceType: "SUBSCRIPTION_ACTION", resourceId: request.id,
      afterJson: { period, status: "PENDING", source: "SELF_SERVICE" } } });
    return { id: request.id, status: request.status, expiresAt: request.expiresAt };
  });
}

export async function listMyPremiumRegistrations(userId: string) {
  return prisma.subscriptionActionRequest.findMany({ where: {
    userId, requestedBy: userId, kind: "MANUAL_GRANT",
  }, orderBy: { createdAt: "desc" }, take: 10,
  select: { id: true, status: true, billingPeriod: true, createdAt: true, expiresAt: true, reviewedAt: true, reviewReason: true } });
}

export async function proposeSubscriptionAction(actor: SystemActor, input: Proposal) {
  requireProposer(actor);
  const reason = validReason(input.reason);
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(input.idempotencyKey)) {
    throw new HttpError(422, "INVALID_IDEMPOTENCY_KEY", "Mã yêu cầu phải có 8–128 ký tự hợp lệ.");
  }
  if (input.userId === actor.userId) throw new HttpError(403, "SELF_GRANT_FORBIDDEN", "Không thể đề xuất thay đổi gói của chính mình.");
  if (input.kind === "MANUAL_GRANT" ? !input.period || Boolean(input.grantId) : !input.grantId || Boolean(input.period)) {
    throw new HttpError(422, "INVALID_SUBSCRIPTION_ACTION", "Thiếu thông tin điều chỉnh gói.");
  }
  return serializable(async db => {
    const prior = await db.subscriptionActionRequest.findUnique({ where: {
      requestedBy_idempotencyKey: { requestedBy: actor.userId, idempotencyKey: input.idempotencyKey },
    } });
    if (prior) {
      if (prior.userId !== input.userId || prior.kind !== input.kind || prior.grantId !== (input.grantId ?? null) ||
          prior.billingPeriod !== (input.period ?? null) || prior.reason !== reason) {
        throw new HttpError(409, "IDEMPOTENCY_CONFLICT", "Mã yêu cầu đã được sử dụng cho thao tác khác.");
      }
      return { id: prior.id, status: prior.status, expiresAt: prior.expiresAt };
    }
    const user = await db.user.findUnique({ where: { id: input.userId },
      select: { id: true, accessState: { select: { status: true } },
        systemRoles: { where: { revokedAt: null }, select: { id: true }, take: 1 } } });
    if (!user) throw new HttpError(404, "USER_NOT_FOUND", "Không tìm thấy người dùng.");
    if (user.accessState && user.accessState.status !== "ACTIVE") {
      throw new HttpError(409, "USER_NOT_ACTIVE", "Không thể điều chỉnh gói khi tài khoản đang bị khóa.");
    }
    if (user.systemRoles.length) throw new HttpError(403, "PRIVILEGED_TARGET", "Không cấp hoặc thu hồi thủ công tài khoản quản trị.");
    if (input.kind === "REVOKE_MANUAL") {
      const grant = await db.subscriptionGrant.findFirst({ where: { id: input.grantId!, userId: input.userId } });
      if (!grant || grant.grantType !== "MANUAL" || grant.revokedAt || grant.expiresAt <= new Date()) {
        throw new HttpError(409, "GRANT_NOT_REVOCABLE", "Chỉ có thể thu hồi grant thủ công còn hiệu lực hoặc được lên lịch.");
      }
    }
    const request = await db.subscriptionActionRequest.create({ data: {
      userId: input.userId, kind: input.kind, grantId: input.grantId ?? null,
      billingPeriod: input.period ?? null, periodCount: input.kind === "MANUAL_GRANT" ? 1 : null,
      reason, requestedBy: actor.userId, idempotencyKey: input.idempotencyKey,
      expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
    } });
    await db.adminAuditLog.create({ data: { actorId: actor.userId, action: "SUBSCRIPTION_ACTION_PROPOSED",
      resourceType: "SUBSCRIPTION_ACTION", resourceId: request.id, reason,
      afterJson: { kind: input.kind, userId: input.userId, grantId: input.grantId ?? null, period: input.period ?? null } } });
    return { id: request.id, status: request.status, expiresAt: request.expiresAt };
  });
}

/** Limited, paginated review queue; never exposes user financial ledgers or account numbers. */
export async function listSubscriptionActions(status: "PENDING" | "APPROVED" | "REJECTED" = "PENDING") {
  return prisma.subscriptionActionRequest.findMany({ where: { status }, take: 50,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }], select: {
      id: true, userId: true, kind: true, status: true, grantId: true, billingPeriod: true,
      periodCount: true, reason: true, requestedBy: true, reviewedBy: true, reviewedAt: true,
      reviewReason: true, createdAt: true, expiresAt: true,
    } });
}

type ActionStatus = "PENDING" | "APPROVED" | "REJECTED";

/** Keyset review queue: an older pending request must remain reachable when
 * more than 50 newer requests are submitted. The cursor is scoped to status. */
export async function listSubscriptionActionPage(status: ActionStatus = "PENDING", cursor?: string) {
  let anchor: { createdAt: Date; id: string } | null = null;
  if (cursor) {
    try {
      if (!/^[a-zA-Z0-9_-]{20,512}$/.test(cursor)) throw new Error("invalid encoding");
      const parsed: { v: number; status: string; at: string; id: string } =
        JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
      if (parsed.v !== 1 || parsed.status !== status || typeof parsed.at !== "string" ||
        typeof parsed.id !== "string" || !/^[a-zA-Z0-9_-]{8,128}$/.test(parsed.id)) {
        throw new Error("invalid fields");
      }
      const createdAt = new Date(parsed.at);
      if (!Number.isFinite(createdAt.getTime()) || createdAt.toISOString() !== parsed.at) {
        throw new Error("invalid timestamp");
      }
      anchor = { createdAt, id: parsed.id };
    } catch {
      throw new HttpError(400, "INVALID_CURSOR", "Trang đề xuất không hợp lệ.");
    }
  }
  const rows = await prisma.subscriptionActionRequest.findMany({
    where: { status, ...(anchor ? { OR: [
      { createdAt: { lt: anchor.createdAt } },
      { createdAt: anchor.createdAt, id: { lt: anchor.id } },
    ] } : {}) },
    take: 51, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true, userId: true, kind: true, status: true, grantId: true, billingPeriod: true,
      periodCount: true, reason: true, requestedBy: true, reviewedBy: true, reviewedAt: true,
      reviewReason: true, createdAt: true, expiresAt: true,
    },
  });
  const items = rows.slice(0, 50);
  const last = items.at(-1);
  const nextCursor = rows.length > 50 && last ? Buffer.from(JSON.stringify({
    v: 1, status, at: last.createdAt.toISOString(), id: last.id,
  })).toString("base64url") : null;
  return { items, nextCursor };
}

/** Operational counts and append-only subscription lifecycle, without bank or
 * personal ledger details. All callers must authorize the Admin page first. */
export async function getSubscriptionOperations() {
  const now = new Date();
  const [pending, approved, rejected, activeManualGrants] = await Promise.all([
    prisma.subscriptionActionRequest.count({ where: { status: "PENDING", expiresAt: { gt: now } } }),
    prisma.subscriptionActionRequest.count({ where: { status: "APPROVED" } }),
    prisma.subscriptionActionRequest.count({ where: { status: "REJECTED" } }),
    prisma.subscriptionGrant.count({ where: { grantType: "MANUAL", revokedAt: null,
      startsAt: { lte: now }, expiresAt: { gt: now } } }),
  ]);
  return { pending, approved, rejected, activeManualGrants };
}

type LifecycleCursor = { v: 1; at: string; id: string };

function readLifecycleCursor(value: string): { createdAt: Date; id: string } {
  try {
    if (!/^[a-zA-Z0-9_-]{20,512}$/.test(value)) throw new Error("invalid encoding");
    const parsed: LifecycleCursor = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (parsed.v !== 1 || typeof parsed.at !== "string" || typeof parsed.id !== "string" ||
        !/^[a-zA-Z0-9_-]{8,128}$/.test(parsed.id)) throw new Error("invalid fields");
    const createdAt = new Date(parsed.at);
    if (!Number.isFinite(createdAt.getTime()) || createdAt.toISOString() !== parsed.at) {
      throw new Error("invalid timestamp");
    }
    return { createdAt, id: parsed.id };
  } catch {
    throw new HttpError(400, "INVALID_CURSOR", "Trang lịch sử không hợp lệ.");
  }
}

function writeLifecycleCursor(row: { createdAt: Date; id: string }) {
  return Buffer.from(JSON.stringify({ v: 1, at: row.createdAt.toISOString(), id: row.id })).toString("base64url");
}

export async function listSubscriptionLifecycle(cursor?: string) {
  const anchor = cursor ? readLifecycleCursor(cursor) : null;
  const rows = await prisma.subscriptionEvent.findMany({
    take: 51, ...(anchor ? { where: { OR: [
      { createdAt: { lt: anchor.createdAt } },
      { createdAt: anchor.createdAt, id: { lt: anchor.id } },
    ] } } : {}),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, userId: true, kind: true, orderId: true, actionRequestId: true,
      createdAt: true, startsAt: true, expiresAt: true },
  });
  const items = rows.slice(0, 50);
  return { items, nextCursor: rows.length > 50 ? writeLifecycleCursor(items[items.length - 1]) : null };
}

export async function decideSubscriptionAction(
  actor: SystemActor, requestId: string, decision: "APPROVE" | "REJECT", reviewReasonRaw: string,
) {
  if (actor.role !== "SUPER_ADMIN") {
    throw new HttpError(403, "SUPER_ADMIN_REQUIRED", "Chỉ quản trị cấp cao được duyệt điều chỉnh gói.");
  }
  const reviewReason = validReason(reviewReasonRaw);
  return serializable(async db => {
    const request = await db.subscriptionActionRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new HttpError(404, "SUBSCRIPTION_ACTION_NOT_FOUND", "Không có yêu cầu này.");
    if (request.requestedBy === actor.userId || request.userId === actor.userId) {
      throw new HttpError(403, "DUAL_APPROVAL_REQUIRED", "Người đề xuất hoặc người được hưởng không thể tự phê duyệt.");
    }
    if (request.status !== "PENDING") {
      // The same reviewer can safely retry after losing an HTTP response.
      if (request.reviewedBy === actor.userId && request.status === (decision === "APPROVE" ? "APPROVED" : "REJECTED")) {
        return { id: request.id, status: request.status };
      }
      throw new HttpError(409, "SUBSCRIPTION_ACTION_RESOLVED", "Yêu cầu đã được xử lý.");
    }
    const now = new Date();
    if (request.expiresAt <= now) throw new HttpError(409, "SUBSCRIPTION_ACTION_EXPIRED", "Đề xuất đã hết hạn duyệt.");
    if (decision === "APPROVE") {
      const user = await db.user.findUnique({ where: { id: request.userId },
        select: { accessState: { select: { status: true } },
          systemRoles: { where: { revokedAt: null }, select: { id: true }, take: 1 } } });
      if (!user || (user.accessState && user.accessState.status !== "ACTIVE")) {
        throw new HttpError(409, "USER_NOT_ACTIVE", "Tài khoản không còn hoạt động.");
      }
      if (user.systemRoles.length) throw new HttpError(403, "PRIVILEGED_TARGET", "Tài khoản đã được nâng quyền quản trị.");
      if (request.kind === "MANUAL_GRANT") {
        if (!request.billingPeriod || request.periodCount !== 1) throw new Error("CORRUPT_SUBSCRIPTION_ACTION");
        const latest = await db.subscriptionGrant.findFirst({ where: {
          userId: request.userId, revokedAt: null, expiresAt: { gt: now },
        }, orderBy: { expiresAt: "desc" } });
        const current = await db.subscription.findUnique({ where: { userId: request.userId } });
        const startsAt = latest ? latest.expiresAt : now;
        const vietnamDay = new Date(startsAt.getTime() + 7 * 60 * 60_000).getUTCDate();
        const anniversaryDay = latest ? (current?.billingAnniversaryDay ?? vietnamDay) : vietnamDay;
        const expiresAt = addVietnamCalendarPeriod(startsAt, request.billingPeriod, 1, anniversaryDay);
        const grant = await db.subscriptionGrant.create({ data: {
          userId: request.userId, grantType: "MANUAL", billingPeriod: request.billingPeriod,
          periodCount: 1, startsAt, expiresAt, createdBy: actor.userId, reason: request.reason,
        } });
        await db.subscriptionEvent.create({ data: {
          userId: request.userId, grantId: grant.id, actionRequestId: request.id,
          kind: "MANUAL_ACTIVATED", startsAt, expiresAt, actorId: actor.userId, reason: request.reason,
        } });
        await db.subscription.upsert({ where: { userId: request.userId },
          create: { userId: request.userId, planCode: "PREMIUM", startsAt, expiresAt, billingAnniversaryDay: anniversaryDay },
          update: { planCode: "PREMIUM", expiresAt, billingAnniversaryDay: anniversaryDay },
        });
      } else if (request.kind === "REVOKE_MANUAL") {
        const revoked = await db.subscriptionGrant.updateMany({ where: {
          id: request.grantId!, userId: request.userId, grantType: "MANUAL", revokedAt: null,
          expiresAt: { gt: now },
        }, data: { revokedAt: now } });
        if (revoked.count !== 1) throw new HttpError(409, "GRANT_NOT_REVOCABLE", "Grant đã hết hạn hoặc được thu hồi.");
        const grant = await db.subscriptionGrant.findUniqueOrThrow({ where: { id: request.grantId! } });
        await db.subscriptionEvent.create({ data: {
          userId: request.userId, grantId: grant.id, actionRequestId: request.id,
          kind: "GRANT_REVOKED", startsAt: grant.startsAt, expiresAt: grant.expiresAt,
          actorId: actor.userId, reason: request.reason,
        } });
        const active = await db.subscriptionGrant.findFirst({ where: {
          userId: request.userId, revokedAt: null, startsAt: { lte: now }, expiresAt: { gt: now },
        }, orderBy: { expiresAt: "desc" } });
        await db.subscription.upsert({ where: { userId: request.userId },
          create: { userId: request.userId, planCode: active ? "PREMIUM" : "LITE",
            startsAt: active?.startsAt ?? null, expiresAt: active?.expiresAt ?? null,
            billingAnniversaryDay: active ? new Date(active.startsAt.getTime() + 7 * 60 * 60_000).getUTCDate() : null },
          update: { planCode: active ? "PREMIUM" : "LITE", startsAt: active?.startsAt ?? null,
            expiresAt: active?.expiresAt ?? null,
            billingAnniversaryDay: active ? new Date(active.startsAt.getTime() + 7 * 60 * 60_000).getUTCDate() : null },
        });
      } else throw new Error("CORRUPT_SUBSCRIPTION_ACTION");
    }
    const status = decision === "APPROVE" ? "APPROVED" : "REJECTED";
    await db.subscriptionActionRequest.update({ where: { id: request.id },
      data: { status, reviewedBy: actor.userId, reviewedAt: now, reviewReason } });
    await db.adminAuditLog.create({ data: { actorId: actor.userId,
      action: decision === "APPROVE" ? "SUBSCRIPTION_ACTION_APPROVED" : "SUBSCRIPTION_ACTION_REJECTED",
      resourceType: "SUBSCRIPTION_ACTION", resourceId: request.id, reason: reviewReason,
      beforeJson: { status: "PENDING" }, afterJson: { status, kind: request.kind, userId: request.userId, grantId: request.grantId } } });
    return { id: request.id, status };
  });
}
