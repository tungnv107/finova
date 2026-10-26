import { NextRequest } from "next/server";
import { requireBankSyncContext } from "@/server/premium";
import { failure, respond } from "@/server/http";
import { isSandboxEnabled, providerCapabilities } from "@/modules/bank-sync/domain";
import { sepayEnabled, sepayEnvironment } from "@/modules/bank-sync/sepay/client";

export async function GET(request: NextRequest) {
  try {
    await requireBankSyncContext(request);
    return respond({ verifiedBanks: [], methods: [
      { code: "STATEMENT_IMPORT", label: "Tải sao kê CSV/XLSX", availability: "AVAILABLE", capabilities: providerCapabilities.STATEMENT_IMPORT },
      ...(sepayEnabled() ? [{ code: "SEPAY_BANKHUB", label: "SePay Bank Hub", availability: sepayEnvironment() === "sandbox" ? "SANDBOX" : "CONFIGURED", capabilities: providerCapabilities.SEPAY_BANKHUB }] : []),
      ...(isSandboxEnabled() ? [{ code: "SANDBOX", label: "Kết nối giả lập (chỉ thử nghiệm)", availability: "SANDBOX", capabilities: providerCapabilities.SANDBOX }] : []),
    ] });
  } catch (error) { return failure(error); }
}
