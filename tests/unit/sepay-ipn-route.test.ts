import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fakes = vi.hoisted(() => ({ findAccounts: vi.fn(), persist: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { bankAccount: { findMany: fakes.findAccounts } } }));
vi.mock("@/modules/bank-sync/service", () => ({ persistBankEnvelope: fakes.persist }));

import { POST } from "@/app/api/webhooks/sepay-bankhub/ipn/route";

const secret = "test-sepay-merchant-ipn-secret-123456";
const event = { gateway: "MBBank", transaction_date: "2026-10-22 09:00:00", bank_account_xid: "acct-1",
  account_number: "1234567890", content: "Thu tien", transfer_type: "credit", amount: 10000,
  reference_code: "FT100", transaction_id: "bank-tx-1", accumulated: 0 };

function request(body: string, authorization = `Apikey ${secret}`, extra: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/webhooks/sepay-bankhub/ipn", { method: "POST", headers: {
    authorization, "content-type": "application/json", ...extra }, body });
}

describe("SePay IPN route trust boundary", () => {
  beforeEach(() => {
    process.env.FINOVA_SEPAY_BANKHUB_ENABLED = "1";
    process.env.FINOVA_SEPAY_BANKHUB_IPN_API_KEY = secret;
    fakes.findAccounts.mockReset(); fakes.persist.mockReset();
    fakes.findAccounts.mockResolvedValue([{ connectionId: "connection-1" }]);
    fakes.persist.mockResolvedValue({ duplicate: false });
  });
  afterEach(() => {
    delete process.env.FINOVA_SEPAY_BANKHUB_ENABLED;
    delete process.env.FINOVA_SEPAY_BANKHUB_IPN_API_KEY;
  });

  it("rejects missing or forged authentication before DB access", async () => {
    expect((await POST(request(JSON.stringify(event), "Apikey invalid"))).status).toBe(401);
    expect((await POST(request(JSON.stringify(event), "Bearer fake"))).status).toBe(401);
    expect(fakes.findAccounts).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON, invalid type and oversized source before persistence", async () => {
    expect((await POST(request("not-json"))).status).toBe(400);
    expect((await POST(request(JSON.stringify({ ...event, amount: 0 })))).status).toBe(400);
    expect((await POST(request(JSON.stringify(event), `Apikey ${secret}`, { "content-type": "text/plain" }))).status).toBe(415);
    expect((await POST(request(JSON.stringify(event), `Apikey ${secret}`, { "content-length": "999999" }))).status).toBe(413);
    expect(fakes.persist).not.toHaveBeenCalled();
  });

  it("rejects unlinked and ambiguous account routing", async () => {
    fakes.findAccounts.mockResolvedValue([]);
    expect((await POST(request(JSON.stringify(event)))).status).toBe(403);
    fakes.findAccounts.mockResolvedValue([{ connectionId: "a" }, { connectionId: "b" }]);
    expect((await POST(request(JSON.stringify(event)))).status).toBe(403);
    expect(fakes.persist).not.toHaveBeenCalled();
  });

  it("acknowledges only after durable persistence and does not expose raw bank data", async () => {
    const result = await POST(request(JSON.stringify(event)));
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ success: true });
    expect(fakes.persist).toHaveBeenCalledOnce();
    const [provider, connection, envelope, , original] = fakes.persist.mock.calls[0];
    expect(provider).toBe("SEPAY_BANKHUB");
    expect(connection).toBe("connection-1");
    expect(envelope.transactions[0].externalTransactionId).toBe("bank-tx-1");
    expect(original.toString()).toBe(JSON.stringify(event));
    fakes.persist.mockRejectedValueOnce(new Error("database not reachable"));
    const failed = await POST(request(JSON.stringify(event)));
    expect(failed.status).toBe(500);
    expect(await failed.json()).not.toHaveProperty("success", true);
  });
});
