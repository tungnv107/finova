import { afterEach, describe, expect, it, vi } from "vitest";
import { SePayBankHubClient, sepayClientFromEnvironment } from "@/modules/bank-sync/sepay/client";
import { mapSePayHistory, parseSePayIpn, sepayDateToIso, verifySePayIpnAuthorization } from "@/modules/bank-sync/sepay/mapper";

const company = "company-1", account = "bank-account-1";
const history = { transaction_id: "tx-1", transaction_date: "2026-10-22 09:00:00", company_xid: company,
  bank_account_xid: account, transfer_type: "credit" as const, amount: 100000,
  transaction_content: "Thanh toan", reference_number: "FT123" };
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

describe("SePay Bank Hub verified contract", () => {
  afterEach(() => {
    delete process.env.FINOVA_SEPAY_BANKHUB_CLIENT_ID;
    delete process.env.FINOVA_SEPAY_BANKHUB_CLIENT_SECRET;
    delete process.env.FINOVA_SEPAY_BANKHUB_ENABLED;
  });

  it("normalizes credit/debit with Vietnam offset, stable bank IDs and no speculative balance", () => {
    const credit = mapSePayHistory(history);
    expect(credit.accountRef).toBe(account);
    expect(credit.eventId).toBe("history:bank-account-1:tx-1");
    expect(credit.transactions[0]).toMatchObject({ amount: "100000", direction: "IN", currency: "VND",
      bookedAt: "2026-10-22T09:00:00+07:00", bookingStatus: "BOOKED", externalTransactionId: "tx-1" });
    const debit = mapSePayHistory({ ...history, transfer_type: "debit" });
    expect(debit.transactions[0].direction).toBe("OUT");
    const otherAccount = mapSePayHistory({ ...history, bank_account_xid: "other-account" });
    expect(otherAccount.eventId).not.toBe(credit.eventId);
    expect(otherAccount.transactions[0].externalTransactionId).toBe(credit.transactions[0].externalTransactionId);
    expect(debit.transactions[0].runningBalance).toBeUndefined();
    expect(() => mapSePayHistory({ ...history, amount: 0 })).toThrow();
    expect(() => mapSePayHistory({ ...history, amount: 10.5 })).toThrow();
    expect(() => mapSePayHistory({ ...history, amount: Number.MAX_SAFE_INTEGER + 1 })).toThrow();
  });

  it("parses the actual IPN schema and enforces constant-time API key verification", () => {
    const secret = "really-long-sepay-ipn-secret-123456";
    expect(verifySePayIpnAuthorization(`Apikey ${secret}`, secret)).toBe(true);
    expect(verifySePayIpnAuthorization(`Bearer ${secret}`, secret)).toBe(false);
    expect(verifySePayIpnAuthorization("Apikey wrong-secret", secret)).toBe(false);
    expect(verifySePayIpnAuthorization(null, secret)).toBe(false);
    const ipn = Buffer.from(JSON.stringify({ gateway: "MBBank", transaction_date: history.transaction_date,
      account_number: "1234", bank_account_xid: account, content: "Thanh toan", transfer_type: "debit", amount: 5000,
      reference_code: "abc", transaction_id: "tx-1", accumulated: 0 }));
    const result = parseSePayIpn(ipn);
    expect(result.eventId).toBe("ipn:bank-account-1:tx-1");
    expect(result.transactions[0].direction).toBe("OUT");
    expect(result.transactions[0].bankReference).toBe("abc");
    expect(result.transactions[0].externalTransactionId).toBe(mapSePayHistory(history).transactions[0].externalTransactionId);
    expect(() => parseSePayIpn(Buffer.from("{bad json"))).toThrow();
    expect(() => parseSePayIpn(Buffer.from(JSON.stringify({ ...JSON.parse(ipn.toString()), amount: -1 })))).toThrow();
    expect(() => sepayDateToIso("2026-10-22 09:00:00")).not.toThrow();
    expect(() => sepayDateToIso("2026-10-22T09:00:00")).toThrow();
  });

  it("fails closed without operator opt-in and partner credentials", () => {
    expect(() => sepayClientFromEnvironment()).toThrow(/Chưa bật/);
    process.env.FINOVA_SEPAY_BANKHUB_ENABLED = "1";
    expect(() => sepayClientFromEnvironment()).toThrow(/Chưa cấu hình/);
  });

  it("authenticates using Basic, refreshes Bearer on 401, scopes paginated history and account list", async () => {
    let tokenCalls = 0;
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const address = String(url);
      if (address.endsWith("/token")) {
        tokenCalls++;
        expect(init?.headers).toMatchObject({ Authorization: `Basic ${Buffer.from("client:secret").toString("base64")}` });
        return response({ code: 201, access_token: `token-${tokenCalls}`, ttl: 60000 }, 201);
      }
      const bearer = (init?.headers as Record<string, string>).Authorization;
      if (tokenCalls === 1) return response({ message: "Expired" }, 401);
      expect(bearer).toBe("Bearer token-2");
      if (address.includes("/bank-account?")) return response({ data: [{ xid: account, company_xid: company,
        account_number: "12345678", active: "1" }], meta: { has_more: false } });
      const u = new URL(address);
      expect(u.searchParams.get("company_xid")).toBe(company);
      expect(u.searchParams.get("bank_account_xid")).toBe(account);
      expect(u.searchParams.get("start_transaction_date")).toBe("2026-10-21");
      return response({ data: [history], meta: { page: 1, total_pages: 1 } });
    });
    const client = new SePayBankHubClient("client", "secret", "sandbox", fetcher as typeof fetch);
    expect(await client.listAccounts(company)).toHaveLength(1);
    expect((await client.historyPage(company, account, "2026-10-21", "2026-10-22", 1)).data).toHaveLength(1);
    expect(tokenCalls).toBe(2);
    expect(fetcher).toHaveBeenCalled();
    expect(String(fetcher.mock.calls[0][0])).toContain("bankhub-api-sandbox.sepay.vn/v1/token");
  });

  it("rejects cross-company rows and invalid page data", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => String(url).endsWith("/token")
      ? response({ access_token: "valid", ttl: 600 }, 201)
      : response({ data: [{ ...history, company_xid: "another-company" }], meta: { page: 1, total_pages: 1 } }));
    const client = new SePayBankHubClient("id", "secret", "sandbox", fetcher as typeof fetch);
    await expect(client.historyPage(company, account, "2026-10-21", "2026-10-22", 1)).rejects.toThrow(/không thuộc tài khoản/);
  });

  it("scopes every account page, rejects mixed companies and stops after a bounded page count", async () => {
    const accounts = (firstCompany: string) => [{ xid: account, company_xid: firstCompany,
      account_number: "12345678", active: "1" }];
    const pagedFetch = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith("/token")) return response({ access_token: "valid", ttl: 600 }, 201);
      const page = Number(new URL(String(url)).searchParams.get("page"));
      return response({ data: accounts(company), meta: { has_more: page === 1, page_count: 2 } });
    });
    const paged = new SePayBankHubClient("id", "secret", "sandbox", pagedFetch as typeof fetch);
    await expect(paged.listAccounts(company)).resolves.toHaveLength(2);
    expect(pagedFetch).toHaveBeenCalledTimes(3);

    const wrongCompany = new SePayBankHubClient("id", "secret", "sandbox", vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith("/token") ? response({ access_token: "valid", ttl: 600 }, 201)
        : response({ data: accounts("foreign-company"), meta: { has_more: false } })) as typeof fetch);
    await expect(wrongCompany.listAccounts(company)).rejects.toMatchObject({ code: "SEPAY_TENANT_MISMATCH" });

    const overLimit = new SePayBankHubClient("id", "secret", "sandbox", vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith("/token") ? response({ access_token: "valid", ttl: 600 }, 201)
        : response({ data: accounts(company), meta: { has_more: true } })) as typeof fetch);
    await expect(overLimit.listAccounts(company)).rejects.toMatchObject({ code: "SEPAY_PAGINATION_LIMIT" });
  });

  it("fails closed on provider pagination 429, HTTP 5xx, or malformed data", async () => {
    for (const status of [429, 503]) {
      const client = new SePayBankHubClient("id", "secret", "sandbox", vi.fn(async (url: string | URL | Request) =>
        String(url).endsWith("/token") ? response({ access_token: "valid", ttl: 600 }, 201)
          : response({ message: "Retry later" }, status)) as typeof fetch);
      await expect(client.listAccounts(company)).rejects.toMatchObject({ code: "SEPAY_API_ERROR", status: 503 });
    }
    const invalid = new SePayBankHubClient("id", "secret", "sandbox", vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith("/token") ? response({ access_token: "valid", ttl: 600 }, 201)
        : response({ data: "unexpected", meta: {} })) as typeof fetch);
    await expect(invalid.listAccounts(company)).rejects.toThrow();
  });

  it("rejects a repeated or malformed page marker rather than accepting duplicated history", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => String(url).endsWith("/token")
      ? response({ access_token: "valid", ttl: 600 }, 201)
      : response({ data: [history], meta: { page: 1, total_pages: 2 } }));
    const client = new SePayBankHubClient("id", "secret", "sandbox", fetcher as typeof fetch);
    await expect(client.historyPage(company, account, "2026-10-21", "2026-10-22", 2))
      .rejects.toMatchObject({ code: "SEPAY_INVALID_PAGE", status: 502 });
    const malformed = new SePayBankHubClient("id", "secret", "sandbox", vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith("/token") ? response({ access_token: "valid", ttl: 600 }, 201)
        : response({ data: [history], meta: { page: "1", total_pages: 2 } })) as typeof fetch);
    await expect(malformed.historyPage(company, account, "2026-10-21", "2026-10-22", 1))
      .rejects.toMatchObject({ code: "SEPAY_BAD_RESPONSE", status: 502 });
  });

  it("fails on unauthorized merchant, network errors and invalid token payload", async () => {
    const forbidden = new SePayBankHubClient("id", "secret", "sandbox", vi.fn(async () => response({}, 401)) as typeof fetch);
    await expect(forbidden.listAccounts(company)).rejects.toThrow(/từ chối xác thực/);
    const offline = new SePayBankHubClient("id", "secret", "sandbox", vi.fn(async () => { throw new Error("timeout"); }) as typeof fetch);
    await expect(offline.listAccounts(company)).rejects.toThrow(/Không thể kết nối/);
    const invalid = new SePayBankHubClient("id", "secret", "sandbox", vi.fn(async () => response({ ttl: 12 }, 201)) as typeof fetch);
    await expect(invalid.listAccounts(company)).rejects.toThrow(/không hợp lệ/);
  });

  it("creates an account-scoped official unlink hosted link", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith("/token")) return response({ access_token: "valid", ttl: 600 }, 201);
      expect(String(url)).toContain("/link-token/create");
      expect(JSON.parse(String(init?.body))).toMatchObject({ company_xid: company, purpose: "UNLINK_BANK_ACCOUNT",
        bank_account_xid: account });
      return response({ hosted_link_url: "https://bankhub.sepay.vn/link/abc", link_token: "abc", expires_at: "2026-10-22 10:00:00" }, 201);
    });
    const client = new SePayBankHubClient("id", "secret", "sandbox", fetcher as typeof fetch);
    await expect(client.createLink(company, "UNLINK_BANK_ACCOUNT")).rejects.toThrow(/Cần chọn tài khoản/);
    expect(await client.createLink(company, "UNLINK_BANK_ACCOUNT", account)).toMatchObject({
      hostedLinkUrl: "https://bankhub.sepay.vn/link/abc" });
  });
});
