import { z } from "zod";
import { HttpError } from "@/server/context";

const tokenSchema = z.object({ access_token: z.string().min(1), ttl: z.number().int().positive() });
const companySchema = z.object({ data: z.object({ xid: z.string().min(1) }) });
const linkSchema = z.object({ hosted_link_url: z.url(), link_token: z.string().min(1), expires_at: z.string() });
const accountSchema = z.object({
  xid: z.string().min(1), company_xid: z.string().min(1), bank_code: z.string().nullish(),
  brand_name: z.string().nullish(), account_number: z.string().min(1), active: z.union([z.string(), z.number(), z.boolean()]).nullish(),
});
const accountListSchema = z.object({ data: z.array(accountSchema), meta: z.object({ has_more: z.boolean().optional(), page_count: z.number().optional() }).passthrough() });
export const historyRowSchema = z.object({
  transaction_id: z.string().min(1), transaction_date: z.string().min(1), bank_account_xid: z.string().min(1),
  company_xid: z.string().min(1), transfer_type: z.enum(["credit", "debit"]), amount: z.number().int().positive().safe(),
  transaction_content: z.string(), reference_number: z.string().nullish(),
});
const historySchema = z.object({ data: z.array(historyRowSchema), meta: z.object({ page: z.number(), total_pages: z.number() }).passthrough() });

export type SePayAccount = z.infer<typeof accountSchema>;
export type SePayHistoryRow = z.infer<typeof historyRowSchema>;
export type SePayEnvironment = "sandbox" | "production";

export function sepayEnabled() {
  return process.env.FINOVA_SEPAY_BANKHUB_ENABLED === "1";
}

export function sepayEnvironment(): SePayEnvironment {
  return process.env.FINOVA_SEPAY_BANKHUB_ENV === "production" ? "production" : "sandbox";
}

/** Merchant secrets never leave server. Hosts are fixed to the Bank Hub documentation. */
export function sepayClientFromEnvironment() {
  if (!sepayEnabled()) throw new HttpError(503, "SEPAY_DISABLED", "Chưa bật tích hợp SePay Bank Hub.");
  const id = process.env.FINOVA_SEPAY_BANKHUB_CLIENT_ID;
  const secret = process.env.FINOVA_SEPAY_BANKHUB_CLIENT_SECRET;
  if (!id || !secret) throw new HttpError(503, "SEPAY_NOT_CONFIGURED", "Chưa cấu hình thông tin đối tác SePay.");
  return new SePayBankHubClient(id, secret, sepayEnvironment());
}

export class SePayBankHubClient {
  private token: { value: string; expiry: number } | undefined;
  private readonly base: string;

  constructor(private readonly id: string, private readonly secret: string, environment: SePayEnvironment,
    private readonly fetcher: typeof fetch = fetch) {
    this.base = environment === "production" ? "https://bankhub-api.sepay.vn/v1" : "https://bankhub-api-sandbox.sepay.vn/v1";
  }

  private async retrieveToken() {
    let response: Response;
    try {
      response = await this.fetcher(`${this.base}/token`, { method: "POST", headers: {
        Authorization: `Basic ${Buffer.from(`${this.id}:${this.secret}`).toString("base64")}`,
      }, signal: AbortSignal.timeout(8000), cache: "no-store" });
    } catch { throw new HttpError(503, "SEPAY_UNREACHABLE", "Không thể kết nối SePay Bank Hub."); }
    if (!response.ok) throw new HttpError(503, "SEPAY_AUTH_ERROR", "SePay từ chối xác thực đối tác.");
    const parsed = tokenSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) throw new HttpError(502, "SEPAY_BAD_RESPONSE", "Dữ liệu xác thực SePay không hợp lệ.");
    this.token = { value: parsed.data.access_token, expiry: Date.now() + parsed.data.ttl * 1000 };
    return this.token.value;
  }

  private async accessToken() {
    if (this.token && this.token.expiry > Date.now() + 30_000) return this.token.value;
    return this.retrieveToken();
  }

  private async request(path: string, init: { method?: "GET" | "POST"; body?: object } = {}) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.accessToken();
      let response: Response;
      try {
        response = await this.fetcher(`${this.base}${path}`, { method: init.method ?? "GET", headers: {
          Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}),
        }, ...(init.body ? { body: JSON.stringify(init.body) } : {}), cache: "no-store", signal: AbortSignal.timeout(10000) });
      } catch { throw new HttpError(503, "SEPAY_UNREACHABLE", "Không thể kết nối SePay Bank Hub."); }
      if (response.status === 401 && attempt === 0) { this.token = undefined; continue; }
      if (!response.ok) throw new HttpError(response.status === 429 || response.status >= 500 ? 503 : 502,
        "SEPAY_API_ERROR", `SePay Bank Hub trả về HTTP ${response.status}.`);
      try { return await response.json() as unknown; }
      catch { throw new HttpError(502, "SEPAY_BAD_RESPONSE", "Dữ liệu trả về từ SePay không phải JSON."); }
    }
    throw new HttpError(503, "SEPAY_AUTH_ERROR", "SePay từ chối xác thực đối tác.");
  }

  async createCompany(name: string) {
    return companySchema.parse(await this.request("/company/create", { method: "POST", body: { full_name: name, status: "Active" } })).data.xid;
  }

  async createLink(companyXid: string, purpose: "LINK_BANK_ACCOUNT" | "UNLINK_BANK_ACCOUNT" = "LINK_BANK_ACCOUNT",
    bankAccountXid?: string) {
    if (purpose === "UNLINK_BANK_ACCOUNT" && !bankAccountXid) {
      throw new HttpError(422, "BANK_ACCOUNT_REQUIRED", "Cần chọn tài khoản ngân hàng để hủy liên kết.");
    }
    const link = linkSchema.parse(await this.request("/link-token/create", { method: "POST",
      body: { company_xid: companyXid, purpose, ...(bankAccountXid ? { bank_account_xid: bankAccountXid } : {}), language: "vi" } }));
    const url = new URL(link.hosted_link_url);
    const expectedHost = this.base.includes("sandbox") ? "bankhub-sandbox.sepay.vn" : "bankhub.sepay.vn";
    // Live/sandbox hosted domains must be verified against SePay configuration before enabling UI.
    if (url.protocol !== "https:" || (url.hostname !== expectedHost && url.hostname !== "bankhub.sepay.vn")) {
      throw new HttpError(502, "SEPAY_INVALID_LINK", "Hosted Link trả về không thuộc miền SePay được cho phép.");
    }
    return { hostedLinkUrl: link.hosted_link_url, expiresAt: link.expires_at, linkToken: link.link_token };
  }

  async listAccounts(companyXid: string) {
    const output: SePayAccount[] = [];
    for (let page = 1; page <= 20; page++) {
      const query = new URLSearchParams({ company_xid: companyXid, page: String(page), per_page: "50" });
      const body = accountListSchema.parse(await this.request(`/bank-account?${query}`));
      if (body.data.some(a => a.company_xid !== companyXid)) throw new HttpError(502, "SEPAY_TENANT_MISMATCH", "SePay trả về tài khoản sai công ty.");
      output.push(...body.data);
      if (!body.meta.has_more && !(body.meta.page_count && page < body.meta.page_count)) return output;
    }
    throw new HttpError(502, "SEPAY_PAGINATION_LIMIT", "Danh sách tài khoản vượt giới hạn phân trang an toàn.");
  }

  async historyPage(companyXid: string, accountXid: string, from: string, to: string, page: number) {
    const q = new URLSearchParams({ company_xid: companyXid, bank_account_xid: accountXid,
      start_transaction_date: from, end_transaction_date: to, page: String(page), per_page: "50" });
    const parsed = historySchema.parse(await this.request(`/transaction?${q}`));
    if (parsed.data.some(r => r.bank_account_xid !== accountXid || r.company_xid !== companyXid)) {
      throw new HttpError(502, "SEPAY_TENANT_MISMATCH", "SePay trả về giao dịch không thuộc tài khoản.");
    }
    return parsed;
  }
}
