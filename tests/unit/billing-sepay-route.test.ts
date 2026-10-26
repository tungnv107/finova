import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { record, verifyReceiver } = vi.hoisted(() => ({
  record: vi.fn(), verifyReceiver: vi.fn(),
}));
vi.mock("../../src/modules/billing/reconciliation", () => ({ recordVerifiedBankCredit: record }));
vi.mock("../../src/modules/billing/service", () => ({ verifyBillingReceivingAccount: verifyReceiver }));

import { POST } from "../../src/app/api/webhooks/billing/sepay/route";

const secret = "sepay-contract-test-only-secret-0123456789";
const payload = {
  id: 92704, gateway: "Test Bank", transactionDate: "2026-10-23 16:00:00",
  accountNumber: "12345678901", content: "Payment FNVAAAAAAAAAAAAAAAAAAAA",
  transferType: "in", transferAmount: 29000,
};
const original = {
  FINOVA_ADMIN_ENABLED: process.env.FINOVA_ADMIN_ENABLED,
  FINOVA_BILLING_SEPAY_WEBHOOK_ENABLED: process.env.FINOVA_BILLING_SEPAY_WEBHOOK_ENABLED,
  FINOVA_BILLING_SEPAY_WEBHOOK_SECRET: process.env.FINOVA_BILLING_SEPAY_WEBHOOK_SECRET,
  FINOVA_BILLING_SEPAY_RECEIVER_ID: process.env.FINOVA_BILLING_SEPAY_RECEIVER_ID,
};

function request(body: unknown, signWith = secret) {
  const text = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  return new NextRequest("https://finova.test/api/webhooks/billing/sepay", {
    method: "POST", body: text,
    headers: { "Content-Type": "application/json", "X-SePay-Timestamp": timestamp,
      "X-SePay-Signature": `sha256=${createHmac("sha256", signWith).update(timestamp).update(".").update(text).digest("hex")}` },
  });
}

beforeEach(() => {
  process.env.FINOVA_ADMIN_ENABLED = "1";
  process.env.FINOVA_BILLING_SEPAY_WEBHOOK_ENABLED = "1";
  process.env.FINOVA_BILLING_SEPAY_WEBHOOK_SECRET = secret;
  process.env.FINOVA_BILLING_SEPAY_RECEIVER_ID = "approvedReceiver123";
  record.mockReset().mockResolvedValue({ id: "event1" });
  verifyReceiver.mockReset().mockResolvedValue(true);
});
afterEach(() => {
  for (const [name, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("SePay raw ingress and durable ACK contract", () => {
  it("rejects incorrect HMAC, invalid schema and unapproved receiver", async () => {
    expect((await POST(request(payload, "different-invalid-secret-0123456789"))).status).toBe(401);
    expect((await POST(request({ ...payload, transferAmount: -20 }))).status).toBe(422);
    verifyReceiver.mockResolvedValueOnce(false);
    expect((await POST(request(payload))).status).toBe(403);
    expect(record).not.toHaveBeenCalled();
  });
  it("returns a failed response when durable insert fails, and ACK only after commit", async () => {
    record.mockRejectedValueOnce(new Error("TEST_DATABASE_UNAVAILABLE"));
    const failed = await POST(request(payload));
    expect(failed.status).toBe(500);
    expect((await failed.json()).success).not.toBe(true);
    expect((await POST(request(payload))).status).toBe(200);
    expect(record).toHaveBeenCalledTimes(2);
  });
  it("keeps the ingress disabled without the release flag", async () => {
    process.env.FINOVA_BILLING_SEPAY_WEBHOOK_ENABLED = "0";
    expect((await POST(request(payload))).status).toBe(404);
  });
});
