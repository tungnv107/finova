import { prisma } from "@/lib/db";
import { HttpError } from "@/server/context";
import { serializable } from "@/server/serializable";
import type { SystemActor } from "@/server/system-auth";
import { isPurchasablePremiumPrice } from "./domain";

export type PremiumProductCode = "PREMIUM_MONTHLY" | "PREMIUM_YEARLY";
const products: Record<PremiumProductCode, "MONTH" | "YEAR"> = {
  PREMIUM_MONTHLY: "MONTH", PREMIUM_YEARLY: "YEAR",
};

function requirePricingRole(actor: SystemActor) {
  if (actor.role !== "SUPER_ADMIN" && actor.role !== "ADMIN") {
    throw new HttpError(403, "PRICING_ROLE_REQUIRED", "Không có quyền quản lý bảng giá.");
  }
}

export function assertDraftAmount(amount: number) {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new HttpError(422, "INVALID_PRICE", "Giá bán phải là số nguyên VND dương an toàn.");
  }
}

export function assertPremiumProductCode(value: string): asserts value is PremiumProductCode {
  if (value !== "PREMIUM_MONTHLY" && value !== "PREMIUM_YEARLY") {
    throw new HttpError(422, "INVALID_PRODUCT", "Mã sản phẩm Premium không hợp lệ.");
  }
}

export async function listAdminPriceVersions(actor: SystemActor) {
  requirePricingRole(actor);
  return (await prisma.planPrice.findMany({
    where: { planCode: "PREMIUM" },
    orderBy: [{ productCode: "asc" }, { version: "desc" }],
    select: { id: true, productCode: true, version: true, priceVnd: true, billingPeriod: true,
      currency: true, isPublished: true, publishedAt: true, effectiveFrom: true, effectiveTo: true },
  })).map(price => ({ ...price, priceVnd: Number(price.priceVnd),
    lifecycle: price.isPublished ? "PUBLISHED" : price.publishedAt ? "ARCHIVED" : "DRAFT" }));
}

export async function createPriceDraft(actor: SystemActor, productCode: string, priceVnd: number) {
  requirePricingRole(actor);
  assertPremiumProductCode(productCode);
  assertDraftAmount(priceVnd);
  return serializable(async db => {
    const latest = await db.planPrice.findFirst({ where: { productCode }, orderBy: { version: "desc" }, select: { version: true } });
    const created = await db.planPrice.create({ data: {
      planCode: "PREMIUM", productCode, billingPeriod: products[productCode],
      periodCount: 1, currency: "VND", priceVnd, version: (latest?.version ?? 0) + 1,
      isPublished: false, publishedAt: null,
    } });
    await db.adminAuditLog.create({ data: { actorId: actor.userId, action: "PRICE_DRAFT_CREATE",
      resourceType: "PLAN_PRICE", resourceId: created.id,
      afterJson: { productCode, version: created.version, priceVnd } } });
    return { id: created.id, productCode, version: created.version, priceVnd, lifecycle: "DRAFT" };
  });
}

export async function updatePriceDraft(actor: SystemActor, id: string, priceVnd: number) {
  requirePricingRole(actor);
  assertDraftAmount(priceVnd);
  return serializable(async db => {
    const price = await db.planPrice.findUnique({ where: { id }, include: { _count: { select: { orders: true } } } });
    if (!price) throw new HttpError(404, "PRICE_NOT_FOUND", "Không tìm thấy phiên bản giá.");
    if (price.publishedAt || price.isPublished || price._count.orders) {
      throw new HttpError(409, "PRICE_IMMUTABLE", "Giá đã công bố hoặc có đơn hàng không thể chỉnh sửa.");
    }
    const changed = await db.planPrice.update({ where: { id }, data: { priceVnd } });
    await db.adminAuditLog.create({ data: { actorId: actor.userId, action: "PRICE_DRAFT_UPDATE",
      resourceType: "PLAN_PRICE", resourceId: id,
      beforeJson: { priceVnd: Number(price.priceVnd) }, afterJson: { priceVnd } } });
    return { id, version: changed.version, priceVnd };
  });
}

export async function deletePriceDraft(actor: SystemActor, id: string) {
  requirePricingRole(actor);
  return serializable(async db => {
    const price = await db.planPrice.findUnique({ where: { id }, include: { _count: { select: { orders: true } } } });
    if (!price) throw new HttpError(404, "PRICE_NOT_FOUND", "Không tìm thấy phiên bản giá.");
    if (price.publishedAt || price.isPublished || price._count.orders) {
      throw new HttpError(409, "PRICE_IMMUTABLE", "Chỉ có thể xóa bản nháp chưa phát hành/chưa tạo đơn.");
    }
    await db.planPrice.delete({ where: { id } });
    await db.adminAuditLog.create({ data: { actorId: actor.userId, action: "PRICE_DRAFT_DELETE",
      resourceType: "PLAN_PRICE", resourceId: id,
      beforeJson: { productCode: price.productCode, version: price.version, priceVnd: Number(price.priceVnd) } } });
    return { id, deleted: true };
  });
}

export async function publishPriceDraft(actor: SystemActor, id: string) {
  requirePricingRole(actor);
  return serializable(async db => {
    const price = await db.planPrice.findUnique({ where: { id }, include: { plan: { select: { isActive: true } } } });
    if (!price) throw new HttpError(404, "PRICE_NOT_FOUND", "Không tìm thấy phiên bản giá.");
    if (price.isPublished || price.publishedAt || !price.plan.isActive || !isPurchasablePremiumPrice(price)) {
      throw new HttpError(409, "PRICE_NOT_PUBLISHABLE", "Chỉ bản nháp hợp lệ mới được công bố.");
    }
    const now = new Date();
    const previous = await db.planPrice.findMany({ where: { productCode: price.productCode, isPublished: true },
      select: { id: true, version: true, effectiveFrom: true } });
    for (const old of previous) {
      await db.planPrice.update({ where: { id: old.id }, data: {
        isPublished: false, effectiveTo: new Date(Math.max(now.getTime(), old.effectiveFrom.getTime())),
      } });
    }
    const result = await db.planPrice.update({ where: { id }, data: {
      isPublished: true, effectiveFrom: now, effectiveTo: null, publishedAt: now,
    } });
    await db.adminAuditLog.create({ data: { actorId: actor.userId, action: "PRICE_PUBLISH",
      resourceType: "PLAN_PRICE", resourceId: id,
      beforeJson: { replacedVersions: previous.map(p => p.version) },
      afterJson: { version: result.version, productCode: result.productCode, priceVnd: Number(result.priceVnd) } } });
    return { id, productCode: result.productCode, version: result.version, lifecycle: "PUBLISHED" };
  });
}

export async function unpublishPrice(actor: SystemActor, id: string) {
  requirePricingRole(actor);
  return serializable(async db => {
    const price = await db.planPrice.findUnique({ where: { id } });
    if (!price) throw new HttpError(404, "PRICE_NOT_FOUND", "Không tìm thấy phiên bản giá.");
    if (!price.isPublished || !price.publishedAt) {
      throw new HttpError(409, "PRICE_NOT_PUBLISHED", "Phiên bản giá này không đang mở bán.");
    }
    await db.planPrice.update({ where: { id }, data: { isPublished: false,
      effectiveTo: new Date(Math.max(Date.now(), price.effectiveFrom.getTime())) } });
    await db.adminAuditLog.create({ data: { actorId: actor.userId, action: "PRICE_UNPUBLISH",
      resourceType: "PLAN_PRICE", resourceId: id,
      beforeJson: { published: true, version: price.version }, afterJson: { published: false } } });
    return { id, lifecycle: "ARCHIVED" };
  });
}
