import { NextRequest } from "next/server";
import { HttpError } from "@/server/context";
import { failure, respond } from "@/server/http";
import { isSandboxEnabled } from "@/modules/bank-sync/domain";
import { bankProviderAdapters } from "@/modules/bank-sync/adapters";
import { persistBankEnvelope } from "@/modules/bank-sync/service";

/** Bounded raw-body read, before JSON parse and before signature verification. */
async function limitedRaw(request: NextRequest) {
  const max = 256 * 1024;
  if (Number(request.headers.get("content-length") ?? 0) > max) throw new HttpError(413, "PAYLOAD_TOO_LARGE", "Sự kiện vượt giới hạn.");
  if (!request.body) throw new HttpError(400, "EMPTY_BODY", "Thiếu nội dung.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > max) { await reader.cancel(); throw new HttpError(413, "PAYLOAD_TOO_LARGE", "Sự kiện vượt giới hạn."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, length);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const { provider } = await params;
    if (provider !== "sandbox" || !isSandboxEnabled()) throw new HttpError(404, "PROVIDER_UNAVAILABLE", "Nguồn kết nối chưa được xác minh.");
    if (request.headers.get("content-type")?.split(";")[0]?.toLowerCase() !== "application/json") {
      throw new HttpError(415, "INVALID_CONTENT_TYPE", "Cần application/json.");
    }
    const raw = await limitedRaw(request);
    const adapter = bankProviderAdapters.SANDBOX;
    if (!adapter.verifyWebhook(raw, request.headers, process.env.FINOVA_BANK_SANDBOX_SECRET)) {
      throw new HttpError(401, "INVALID_SIGNATURE", "Xác thực sự kiện thất bại.");
    }
    const connectionId = request.headers.get("x-finova-connection-id");
    if (!connectionId || connectionId.length > 200) throw new HttpError(403, "INVALID_CONNECTION", "Kết nối không hợp lệ.");
    let envelope;
    try { envelope = adapter.parseWebhook(raw); }
    catch { throw new HttpError(400, "INVALID_BODY", "Sự kiện không đúng định dạng."); }
    const result = await persistBankEnvelope("SANDBOX", connectionId, envelope, raw);
    return respond({ accepted: true, duplicate: result.duplicate }, result.duplicate ? 200 : 202);
  } catch (error) { return failure(error); }
}
