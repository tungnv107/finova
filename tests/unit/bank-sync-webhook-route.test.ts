import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syntheticWebhookFixture } from "@/modules/bank-sync/adapters";

const persist = vi.hoisted(() => vi.fn());
vi.mock("@/modules/bank-sync/service", () => ({ persistBankEnvelope: persist }));
import { POST } from "@/app/api/webhooks/bank-sync/[provider]/route";

const secret = "test-sandbox-key-with-at-least-32-characters";
const envelope = { eventId: "synthetic-1", accountRef: "synthetic-account", transactions: [{
  amount: "125000", currency: "VND" as const, direction: "IN" as const,
  occurredAt: "2026-10-21T10:00:00+07:00", bookingStatus: "BOOKED" as const, descriptionRaw: "Test only",
}] };
const context = { params: Promise.resolve({ provider: "sandbox" }) };

function send(raw: Uint8Array, headers: Headers) {
  return POST(new NextRequest("http://localhost/api/webhooks/bank-sync/sandbox", {
    method: "POST", headers, body: Buffer.from(raw),
  }), context);
}

describe("synthetic webhook route validation before durable acknowledgement", () => {
  beforeEach(() => {
    process.env.FINOVA_BANK_SANDBOX_ENABLED = "1";
    process.env.FINOVA_BANK_SANDBOX_SECRET = secret;
    persist.mockReset();
    persist.mockResolvedValue({ id: "stored-event", duplicate: false });
  });
  afterEach(() => {
    delete process.env.FINOVA_BANK_SANDBOX_ENABLED;
    delete process.env.FINOVA_BANK_SANDBOX_SECRET;
  });

  it("persists a signed event before returning 202, and reports retries as duplicates", async () => {
    const fixture = syntheticWebhookFixture(envelope, secret, Math.floor(Date.now() / 1000));
    fixture.headers.set("x-finova-connection-id", "synthetic-connection");
    const first = await send(fixture.raw, fixture.headers);
    expect(first.status).toBe(202);
    expect(persist).toHaveBeenCalledExactlyOnceWith("SANDBOX", "synthetic-connection", expect.objectContaining({ eventId: "synthetic-1" }), expect.any(Uint8Array));
    persist.mockResolvedValue({ id: "stored-event", duplicate: true });
    const repeated = await send(fixture.raw, fixture.headers);
    expect(repeated.status).toBe(200);
    expect((await repeated.json()).data.duplicate).toBe(true);
  });

  it("rejects forgery, oversized payload and malformed JSON before persistence", async () => {
    const fixture = syntheticWebhookFixture(envelope, secret, Math.floor(Date.now() / 1000));
    fixture.headers.set("x-finova-connection-id", "synthetic-connection");
    const forged = await send(Buffer.from("tampered"), fixture.headers);
    expect(forged.status).toBe(401);
    const oversized = new Headers(fixture.headers); oversized.set("content-length", "300000");
    expect((await send(fixture.raw, oversized)).status).toBe(413);
    const badRaw = Buffer.from("not json");
    const timestamp = fixture.headers.get("x-finova-timestamp")!;
    const badHeaders = new Headers(fixture.headers);
    badHeaders.set("x-finova-signature", createHmac("sha256", secret).update(timestamp).update("\n").update(badRaw).digest("hex"));
    expect((await send(badRaw, badHeaders)).status).toBe(400);
    expect(persist).not.toHaveBeenCalled();
  });

  it("fails closed when sandbox disabled or connection identity missing", async () => {
    const fixture = syntheticWebhookFixture(envelope, secret, Math.floor(Date.now() / 1000));
    expect((await send(fixture.raw, fixture.headers)).status).toBe(403);
    process.env.FINOVA_BANK_SANDBOX_ENABLED = "0";
    expect((await send(fixture.raw, fixture.headers)).status).toBe(404);
    expect(persist).not.toHaveBeenCalled();
  });

  it("never acknowledges when durable persistence fails", async () => {
    const fixture = syntheticWebhookFixture(envelope, secret, Math.floor(Date.now() / 1000));
    fixture.headers.set("x-finova-connection-id", "synthetic-connection");
    persist.mockRejectedValue(new Error("database offline"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await send(fixture.raw, fixture.headers);
      expect(response.status).toBe(500);
      expect((await response.json()).error.code).toBe("SERVER_ERROR");
    } finally { log.mockRestore(); }
  });
});
