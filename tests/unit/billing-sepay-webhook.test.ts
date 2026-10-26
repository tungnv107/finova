import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseSePayBillingWebhook, verifySePayBillingSignature } from "../../src/modules/billing/sepay-webhook";

const secret = "billing-fixture-secret-do-not-use-in-real-webhooks-2026";
const body = {
  id: 92704, gateway: "Vietcombank", transactionDate: "2026-10-23 09:30:20",
  accountNumber: "001234567890", content: "Chuyen khoan FNVAAAAAAAAAAAAAAAAAAAA",
  transferType: "in", transferAmount: 29000, accumulated: 500000,
};
const payload = Buffer.from(JSON.stringify(body), "utf8");
const ts = "1792720000";
const signedHeaders = (raw: Buffer, timestamp = ts) => new Headers({
  "X-SePay-Timestamp": timestamp,
  "X-SePay-Signature": "sha256=" + createHmac("sha256", secret).update(timestamp).update(".").update(raw).digest("hex"),
});

describe("SePay receiving-account webhook", () => {
  it("verifies HMAC over exact raw bytes and rejects replayed or modified requests", () => {
    expect(verifySePayBillingSignature(payload, signedHeaders(payload), secret, Number(ts))).toBe(true);
    expect(verifySePayBillingSignature(Buffer.concat([payload, Buffer.from(" ")]), signedHeaders(payload), secret, Number(ts))).toBe(false);
    expect(verifySePayBillingSignature(payload, signedHeaders(payload), secret + "wrong", Number(ts))).toBe(false);
    expect(verifySePayBillingSignature(payload, signedHeaders(payload), secret, Number(ts) + 301)).toBe(false);
    expect(verifySePayBillingSignature(payload, new Headers(), secret, Number(ts))).toBe(false);
  });
  it("normalizes a verified deposit and Vietnam transaction time", () => {
    const credit = parseSePayBillingWebhook(payload, "approvedReceiver123");
    expect(credit).toMatchObject({ provider: "SEPAY_BILLING", providerTransactionId: "92704",
      receiverAccountId: "approvedReceiver123", amountVnd: "29000", direction: "IN",
      accountNumber: "001234567890" });
    expect(credit.occurredAt.toISOString()).toBe("2026-10-23T02:30:20.000Z");
  });
  it("rejects malformed, unsafe amount and impossible timestamps", () => {
    const variant = (values: Record<string, unknown>) => Buffer.from(JSON.stringify({ ...body, ...values }));
    expect(() => parseSePayBillingWebhook(variant({ transferAmount: 29000.5 }), "receiverId123")).toThrow();
    expect(() => parseSePayBillingWebhook(variant({ transferAmount: -1 }), "receiverId123")).toThrow();
    expect(() => parseSePayBillingWebhook(variant({ transactionDate: "2026-02-30 09:30:20" }), "receiverId123")).toThrow();
    expect(() => parseSePayBillingWebhook(variant({ transferType: "unknown" }), "receiverId123")).toThrow();
    expect(() => parseSePayBillingWebhook(Buffer.from("not JSON"), "receiverId123")).toThrow();
  });

  it("rejects zero, missing, null, fractional and unsafe money before a verified event can enter the ledger", () => {
    const variant = (transferAmount: unknown) => Buffer.from(JSON.stringify({ ...body, transferAmount }));
    for (const amount of [0, null, -1, 1.25, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => parseSePayBillingWebhook(variant(amount), "receiverId123")).toThrow();
    }
    const missing = { ...body } as Partial<typeof body>;
    delete missing.transferAmount;
    expect(() => parseSePayBillingWebhook(Buffer.from(JSON.stringify(missing)), "receiverId123")).toThrow();
  });
});
