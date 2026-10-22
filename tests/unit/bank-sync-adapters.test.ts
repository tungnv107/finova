import { describe, expect, it } from "vitest";
import { bankProviderAdapters, syntheticWebhookFixture } from "@/modules/bank-sync/adapters";

const secret = "synthetic-secret-32-bytes-or-longer-for-tests";
const now = 1792650000;
const envelope = { eventId: "event-001", accountRef: "test-account", transactions: [{ amount: "125000", currency: "VND" as const,
  direction: "IN" as const, occurredAt: "2026-10-21T09:00:00+07:00", bookingStatus: "BOOKED" as const,
  descriptionRaw: "Synthetic payment" }] };

describe("bank provider contract", () => {
  it("exposes explicit local and SePay transports without enabling credentials by default", () => {
    expect(Object.keys(bankProviderAdapters).sort()).toEqual(["SANDBOX", "SEPAY_BANKHUB", "STATEMENT_IMPORT"]);
    expect(bankProviderAdapters.SANDBOX.transport).toBe("SIGNED_WEBHOOK");
    expect(bankProviderAdapters.SANDBOX.capabilities.personalAccounts).toBe(false);
    expect(bankProviderAdapters.STATEMENT_IMPORT.transport).toBe("USER_FILE");
    expect(bankProviderAdapters.STATEMENT_IMPORT.capabilities.webhook).toBe(false);
    expect(bankProviderAdapters.SEPAY_BANKHUB.transport).toBe("REST_AND_IPN");
  });

  it("accepts a signed synthetic fixture and rejects forged, expired and malformed bodies", () => {
    const adapter = bankProviderAdapters.SANDBOX;
    const { raw, headers } = syntheticWebhookFixture(envelope, secret, now);
    expect(adapter.verifyWebhook(raw, headers, secret, now)).toBe(true);
    expect(adapter.parseWebhook(raw)).toMatchObject(envelope);
    expect(adapter.verifyWebhook(raw, headers, secret, now + 301)).toBe(false);
    expect(adapter.verifyWebhook(Buffer.from("tampered"), headers, secret, now)).toBe(false);
    const altered = new Headers(headers); altered.set("x-finova-signature", "0000");
    expect(adapter.verifyWebhook(raw, altered, secret, now)).toBe(false);
    expect(() => adapter.parseWebhook(Buffer.from("not JSON"))).toThrow();
    expect(() => adapter.parseWebhook(Buffer.from(JSON.stringify({ ...envelope, transactions: [] })))).toThrow();
  });
});
