import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { HttpError } from "@/server/context";
import type { SystemActor } from "@/server/system-auth";
import { serializable } from "@/server/serializable";
import { INITIAL_PRICES, isPurchasablePremiumPrice } from "./domain";

export const checkoutEnabled = () => process.env.FINOVA_ADMIN_ENABLED === "1" && process.env.FINOVA_BILLING_CHECKOUT_ENABLED === "1";

function billingKey() {
  const value = process.env.FINOVA_BILLING_ENCRYPTION_KEY ?? "";
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new HttpError(503, "BILLING_KEY_MISSING", "Chưa cấu hình khóa mã hóa thu phí.");
  return Buffer.from(value, "hex");
}
function seal(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", billingKey(), iv);
  return Buffer.concat([iv, cipher.update(value, "utf8"), cipher.final(), cipher.getAuthTag()]).toString("base64");
}
function open(value: string) {
  const raw = Buffer.from(value, "base64");
  if (raw.length < 29) throw new Error("INVALID_BILLING_CIPHERTEXT");
  const decipher = createDecipheriv("aes-256-gcm", billingKey(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(raw.length - 16));
  return Buffer.concat([decipher.update(raw.subarray(12, -16)), decipher.final()]).toString("utf8");
}

export async function getPublishedPrices() {
  if (process.env.FINOVA_ADMIN_ENABLED !== "1") return INITIAL_PRICES.map(p => ({ ...p, id: null, currency: "VND", available: false }));
  const now = new Date();
  const prices = await prisma.planPrice.findMany({ where: { isPublished: true, planCode: "PREMIUM", effectiveFrom: { lte: now },
    OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] }, orderBy: { version: "desc" } });
  return prices.filter(isPurchasablePremiumPrice)
    .filter((p, i, all) => all.findIndex(other => other.productCode === p.productCode) === i)
    .map(p => ({ id: p.id, productCode: p.productCode, billingPeriod: p.billingPeriod, periodCount: p.periodCount,
      priceVnd: Number(p.priceVnd), currency: p.currency, available: checkoutEnabled() }));
}

export async function listReceivingAccounts() {
  return (await prisma.billingReceivingAccount.findMany({ orderBy: { createdAt: "desc" } })).map(a => ({
    id: a.id, bankCode: a.bankCode, bankName: a.bankName, accountName: a.accountName,
    accountMasked: `••••${a.accountNumberLast4}`, status: a.status, createdBy: a.createdBy,
    approvedBy: a.approvedBy, createdAt: a.createdAt,
  }));
}

/** Bind a billing webhook to an independently approved FINOVA receiver, never a user's Bank Hub account. */
export async function verifyBillingReceivingAccount(receiverId: string, incomingAccountNumber: string) {
  const account = await prisma.billingReceivingAccount.findUnique({ where: { id: receiverId } });
  if (!account || !account.approvedBy || account.status !== "ACTIVE") return false;
  const expected = Buffer.from(open(account.accountNumberEncrypted), "utf8");
  const provided = Buffer.from(incomingAccountNumber, "utf8");
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

export async function proposeReceivingAccount(actor: SystemActor, input: { bankCode: string; bankName: string; accountName: string; accountNumber: string }) {
  if (actor.role !== "SUPER_ADMIN" && actor.role !== "ADMIN") {
    throw new HttpError(403, "SYSTEM_ROLE_REQUIRED", "Không có quyền đề xuất tài khoản nhận phí.");
  }
  const account = await prisma.$transaction(async db => {
    const created = await db.billingReceivingAccount.create({ data: { bankCode: input.bankCode, bankName: input.bankName,
      accountName: input.accountName, accountNumberEncrypted: seal(input.accountNumber),
      accountNumberLast4: input.accountNumber.slice(-4), createdBy: actor.userId } });
    await db.adminAuditLog.create({ data: { actorId: actor.userId, action: "RECEIVER_PROPOSE", resourceType: "RECEIVING_ACCOUNT", resourceId: created.id,
      afterJson: { bankCode: created.bankCode, status: created.status, last4: created.accountNumberLast4 } } });
    return created;
  });
  return { id: account.id, status: account.status, accountMasked: `••••${account.accountNumberLast4}` };
}

export async function approveReceivingAccount(actor: SystemActor, id: string) {
  if (actor.role !== "SUPER_ADMIN") {
    throw new HttpError(403, "SUPER_ADMIN_REQUIRED", "Chỉ Super Admin được duyệt tài khoản nhận phí.");
  }
  return serializable(async db => {
    const proposed = await db.billingReceivingAccount.findUnique({ where: { id } });
    if (!proposed) throw new HttpError(404, "RECEIVER_NOT_FOUND", "Không tìm thấy tài khoản nhận phí.");
    if (proposed.status !== "PENDING_APPROVAL") throw new HttpError(409, "RECEIVER_STATUS", "Tài khoản không còn chờ duyệt.");
    if (proposed.createdBy === actor.userId) throw new HttpError(403, "DUAL_APPROVAL_REQUIRED", "Người tạo không thể tự phê duyệt.");
    await db.billingReceivingAccount.updateMany({ where: { status: "ACTIVE" }, data: { status: "DISABLED" } });
    const approved = await db.billingReceivingAccount.update({ where: { id }, data: { status: "ACTIVE", approvedBy: actor.userId, approvedAt: new Date() } });
    await db.adminAuditLog.create({ data: { actorId: actor.userId, action: "RECEIVER_APPROVE", resourceType: "RECEIVING_ACCOUNT", resourceId: id,
      afterJson: { status: "ACTIVE", last4: approved.accountNumberLast4 } } });
    return { id, status: approved.status };
  });
}

export async function createBillingOrder(userId: string, priceId: string, idempotencyKey: string) {
  if (!checkoutEnabled()) throw new HttpError(503, "CHECKOUT_DISABLED", "Thanh toán Premium chưa mở.");
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(idempotencyKey)) throw new HttpError(400, "INVALID_IDEMPOTENCY_KEY", "Thiếu mã yêu cầu duy nhất.");
  const existing = await prisma.billingOrder.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey } } });
  if (existing) {
    if (existing.priceId !== priceId) throw new HttpError(409, "IDEMPOTENCY_CONFLICT", "Mã yêu cầu đã dùng cho gói khác.");
    return getBillingOrder(userId, existing.id);
  }
  const now = new Date();
  const price = await prisma.planPrice.findFirst({ where: { id: priceId, planCode: "PREMIUM", isPublished: true,
    effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] } });
  if (!price) throw new HttpError(422, "PRICE_UNAVAILABLE", "Gói chưa được mở bán.");
  if (!isPurchasablePremiumPrice(price)) throw new HttpError(422, "INVALID_PRICE", "Bảng giá hiện không hợp lệ.");
  const receiver = await prisma.billingReceivingAccount.findFirst({ where: { status: "ACTIVE", approvedBy: { not: null } } });
  if (!receiver) throw new HttpError(503, "RECEIVER_NOT_READY", "Chưa có tài khoản nhận phí được xác minh.");
  // Serializable transaction plus the DB unique key ensure concurrent identical requests return one order.
  const orderId = await serializable(async db => {
    const repeat = await db.billingOrder.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey } } });
    if (repeat) {
      if (repeat.priceId !== priceId) throw new HttpError(409, "IDEMPOTENCY_CONFLICT", "Mã yêu cầu đã dùng cho gói khác.");
      return repeat.id;
    }
    const created = await db.billingOrder.create({ data: { userId, priceId: price.id, receiverAccountId: receiver.id,
      orderCode: `FNV${randomBytes(10).toString("hex").toUpperCase()}`, idempotencyKey, planCode: "PREMIUM",
      billingPeriodSnapshot: price.billingPeriod, periodCountSnapshot: price.periodCount, amountDueVnd: price.priceVnd,
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000) } });
    return created.id;
  });
  return getBillingOrder(userId, orderId);
}

export async function getBillingOrder(userId: string, orderId: string) {
  const order = await prisma.billingOrder.findFirst({ where: { id: orderId, userId }, include: { receiver: true } });
  if (!order) throw new HttpError(404, "ORDER_NOT_FOUND", "Không tìm thấy đơn hàng.");
  return { id: order.id, orderCode: order.orderCode, productCode: order.billingPeriodSnapshot === "MONTH" ? "PREMIUM_MONTHLY" : "PREMIUM_YEARLY",
    amountVnd: Number(order.amountDueVnd), currency: order.currency,
    period: order.billingPeriodSnapshot, periodCount: order.periodCountSnapshot,
    status: order.status === "PENDING_PAYMENT" && order.expiresAt <= new Date() ? "EXPIRED" : order.status,
    createdAt: order.createdAt, expiresAt: order.expiresAt, paidAt: order.paidAt,
    activatedAt: order.activatedAt,
    bank: { code: order.receiver.bankCode, name: order.receiver.bankName, accountName: order.receiver.accountName,
      accountNumber: open(order.receiver.accountNumberEncrypted) }, transferReference: order.orderCode };
}

export async function listBillingOrders(userId: string) {
  const orders = await prisma.billingOrder.findMany({ where: { userId }, take: 30, orderBy: { createdAt: "desc" } });
  const now = new Date();
  return orders.map(o => ({ id: o.id, orderCode: o.orderCode, amountVnd: Number(o.amountDueVnd),
    period: o.billingPeriodSnapshot, status: o.status === "PENDING_PAYMENT" && o.expiresAt <= now ? "EXPIRED" : o.status,
    createdAt: o.createdAt, expiresAt: o.expiresAt, paidAt: o.paidAt, activatedAt: o.activatedAt }));
}
