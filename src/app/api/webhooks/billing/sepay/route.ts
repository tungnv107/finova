import type { NextRequest } from "next/server";
import { HttpError } from "@/server/context";
import { failure } from "@/server/http";
import { recordVerifiedBankCredit } from "@/modules/billing/reconciliation";
import { verifyBillingReceivingAccount } from "@/modules/billing/service";
import { parseSePayBillingWebhook, sepayBillingWebhookEnabled, verifySePayBillingSignature } from "@/modules/billing/sepay-webhook";

/** No Better Auth user session: this endpoint requires SePay's signed raw request. */
export async function POST(request: NextRequest) {
  try {
    if (!sepayBillingWebhookEnabled()) throw new HttpError(404, "BILLING_WEBHOOK_DISABLED", "Webhook chưa mở.");
    if (request.headers.get("content-type")?.split(";")[0]?.toLowerCase() !== "application/json") {
      throw new HttpError(415, "CONTENT_TYPE", "Webhook phải là application/json.");
    }
    const secret = process.env.FINOVA_BILLING_SEPAY_WEBHOOK_SECRET ?? "";
    const receiverId = process.env.FINOVA_BILLING_SEPAY_RECEIVER_ID ?? "";
    if (secret.length < 32 || !/^[A-Za-z0-9_-]{6,150}$/.test(receiverId)) {
      throw new HttpError(503, "BILLING_WEBHOOK_NOT_CONFIGURED", "Webhook chưa được cấu hình.");
    }
    if (!request.body) throw new HttpError(400, "EMPTY_BODY", "Thiếu dữ liệu webhook.");
    const limit = 16 * 1024;
    if (Number(request.headers.get("content-length") ?? 0) > limit) throw new HttpError(413, "BODY_TOO_LARGE", "Webhook quá lớn.");
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) { await reader.cancel(); throw new HttpError(413, "BODY_TOO_LARGE", "Webhook quá lớn."); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const raw = Buffer.concat(chunks, size);
    if (!verifySePayBillingSignature(raw, request.headers, secret)) {
      throw new HttpError(401, "INVALID_BILLING_SIGNATURE", "Chữ ký webhook không hợp lệ.");
    }
    const credit = parseSePayBillingWebhook(raw, receiverId);
    if (!(await verifyBillingReceivingAccount(receiverId, credit.accountNumber))) {
      throw new HttpError(403, "BILLING_RECEIVER_MISMATCH", "Tài khoản nhận tiền không được phép.");
    }
    // Commit the canonical event to PostgreSQL BEFORE acknowledging the webhook.
    await recordVerifiedBankCredit(credit);
    return Response.json({ success: true }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
