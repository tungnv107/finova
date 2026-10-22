import { createHmac, randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { bankBookingTransition, bankEnvelope, bankFingerprint, bankRow, isSandboxEnabled, openBankEvent, sealBankEvent, verifySandboxSignature } from "@/modules/bank-sync/domain";

const secret = "test-secret-with-more-than-32-characters";
const raw = Buffer.from('{"eventId":"synthetic-test"}');
const timestamp = "1792650000";

describe("bank sync source contract and security", () => {
  afterEach(() => { delete process.env.FINOVA_BANK_EVENT_KEY; delete process.env.FINOVA_BANK_SANDBOX_ENABLED; });

  it("accepts integer VND and offset timestamps, rejects floats and missing timezone", () => {
    const sample = { externalTransactionId: "id-1", amount: "150000", direction: "IN", currency: "VND",
      occurredAt: "2026-10-10T08:00:00+07:00", bookingStatus: "BOOKED", descriptionRaw: "test" };
    expect(bankRow.parse(sample).amount).toBe("150000");
    expect(() => bankRow.parse({ ...sample, amount: "150000.50" })).toThrow();
    expect(() => bankRow.parse({ ...sample, amount: "0" })).toThrow();
    expect(() => bankRow.parse({ ...sample, occurredAt: "2026-10-10T08:00:00" })).toThrow();
    expect(() => bankEnvelope.parse({ eventId: "e", accountRef: "a", transactions: [] })).toThrow();
  });

  it("authenticates the raw bytes and rejects forgery, late delivery and malformed signatures", () => {
    const signature = createHmac("sha256", secret).update(timestamp).update("\n").update(raw).digest("hex");
    expect(verifySandboxSignature(raw, timestamp, signature, secret, Number(timestamp))).toBe(true);
    expect(verifySandboxSignature(Buffer.from("altered"), timestamp, signature, secret, Number(timestamp))).toBe(false);
    expect(verifySandboxSignature(raw, timestamp, signature, secret, Number(timestamp) + 301)).toBe(false);
    expect(verifySandboxSignature(raw, timestamp, "ab", secret, Number(timestamp))).toBe(false);
    expect(verifySandboxSignature(raw, timestamp, signature, "short", Number(timestamp))).toBe(false);
  });

  it("encrypts bank evidence using authenticated encryption and refuses tampering", () => {
    process.env.FINOVA_BANK_EVENT_KEY = randomBytes(32).toString("base64");
    const sealed = sealBankEvent(raw);
    expect(sealed).not.toContain(raw.toString());
    expect(openBankEvent(sealed)).toEqual(raw);
    const bytes = Buffer.from(sealed, "base64"); bytes[bytes.length - 1] ^= 1;
    expect(() => openBankEvent(bytes.toString("base64"))).toThrow();
  });

  it("fails closed without an encryption key", () => {
    delete process.env.FINOVA_BANK_EVENT_KEY;
    expect(() => sealBankEvent(raw)).toThrow(/FINOVA_BANK_EVENT_KEY/);
  });

  it("uses stable transaction fingerprints per bank account and source", () => {
    const row = bankRow.parse({ amount: "90000", direction: "OUT", currency: "VND", occurredAt: "2026-10-01T00:00:00+07:00",
      bookingStatus: "BOOKED", descriptionRaw: "Đi chợ", bankReference: "REF" });
    expect(bankFingerprint("account-a", row)).toBe(bankFingerprint("account-a", row));
    expect(bankFingerprint("account-a", row)).not.toBe(bankFingerprint("account-b", row));
    expect(bankFingerprint("account-a", row)).not.toBe(bankFingerprint("account-a", { ...row, amount: "90001" }));
  });

  it("keeps sandbox disabled by default", () => {
    delete process.env.FINOVA_BANK_SANDBOX_ENABLED;
    expect(isSandboxEnabled()).toBe(false);
  });

  it("finalizes pending evidence, flags reversals and refuses stale/reopened states", () => {
    expect(bankBookingTransition("PENDING", "BOOKED")).toBe("BOOKED");
    expect(bankBookingTransition("UNKNOWN", "BOOKED")).toBe("BOOKED");
    expect(bankBookingTransition("BOOKED", "REVERSED")).toBe("REVERSED");
    expect(bankBookingTransition("PENDING", "REVERSED")).toBe("REVERSED");
    expect(bankBookingTransition("BOOKED", "PENDING")).toBe("STALE");
    expect(bankBookingTransition("REVERSED", "BOOKED")).toBe("CONFLICT");
    expect(bankBookingTransition("BOOKED", "BOOKED")).toBe("UNCHANGED");
    expect(bankBookingTransition("PENDING", "UNKNOWN")).toBe("CONFLICT");
  });
});
