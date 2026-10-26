import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { HttpError } from "@/server/context";
import type { VerifiedBankCredit } from "./reconciliation";

/** SePay Webhooks (bank movements), not SePay Payment Gateway IPN or user Bank Hub. */
export const sepayBillingWebhookEnabled = () => process.env.FINOVA_ADMIN_ENABLED === "1" &&
  process.env.FINOVA_BILLING_SEPAY_WEBHOOK_ENABLED === "1";

export function verifySePayBillingSignature(rawBody: Buffer, headers: Headers, secret: string, nowSeconds = Date.now() / 1000) {
  const timestamp = headers.get("x-sepay-timestamp") ?? "";
  const signature = headers.get("x-sepay-signature") ?? "";
  if (secret.length < 32 || !/^\d{10,12}$/.test(timestamp) || !/^sha256=[a-f0-9]{64}$/i.test(signature) ||
      Math.abs(nowSeconds - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha256", secret).update(timestamp).update(".").update(rawBody).digest();
  const actual = Buffer.from(signature.slice(7), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

const sepayTransaction = z.object({
  id: z.union([z.number().int().positive().safe(), z.string().regex(/^\d{1,18}$/)]),
  gateway: z.string().min(2).max(100),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/),
  accountNumber: z.string().regex(/^\d{6,30}$/),
  content: z.string().max(1000).nullable(),
  transferType: z.enum(["in", "out"]),
  transferAmount: z.number().int().positive().safe(),
}).passthrough();

export function parseSePayBillingWebhook(rawBody: Buffer, receiverAccountId: string):
  VerifiedBankCredit & { accountNumber: string; gateway: string } {
  let json: unknown;
  try { json = JSON.parse(rawBody.toString("utf8")); }
  catch { throw new HttpError(400, "INVALID_SEPAY_JSON", "Webhook JSON không hợp lệ."); }
  const parsed = sepayTransaction.safeParse(json);
  if (!parsed.success) throw new HttpError(422, "INVALID_SEPAY_EVENT", "Dữ liệu webhook ngân hàng không hợp lệ.");
  const event = parsed.data;
  const occurredAt = new Date(event.transactionDate.replace(" ", "T") + "+07:00");
  const roundtrip = new Date(occurredAt.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");
  if (!Number.isFinite(occurredAt.getTime()) || roundtrip !== event.transactionDate) {
    throw new HttpError(422, "INVALID_SEPAY_DATE", "Thời gian giao dịch ngân hàng không hợp lệ.");
  }
  return {
    provider: "SEPAY_BILLING", receiverAccountId, providerTransactionId: String(event.id),
    direction: event.transferType === "in" ? "IN" : "OUT",
    amountVnd: String(event.transferAmount), reference: event.content ?? "", occurredAt,
    accountNumber: event.accountNumber, gateway: event.gateway,
  };
}
