import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { HttpError } from "@/server/context";
import { failure } from "@/server/http";
import { sepayEnabled } from "@/modules/bank-sync/sepay/client";
import { parseSePayIpn, verifySePayIpnAuthorization } from "@/modules/bank-sync/sepay/mapper";
import { persistBankEnvelope } from "@/modules/bank-sync/service";

async function readBoundedRaw(request: NextRequest) {
  const limit = 64 * 1024;
  if (Number(request.headers.get("content-length") ?? 0) > limit) throw new HttpError(413, "PAYLOAD_TOO_LARGE", "Sự kiện vượt giới hạn.");
  if (!request.body) throw new HttpError(400, "EMPTY_BODY", "Không có sự kiện.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) { await reader.cancel(); throw new HttpError(413, "PAYLOAD_TOO_LARGE", "Sự kiện vượt giới hạn."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, size);
}

/** Bank Hub IPN is distinct from its link/unlink event webhook. */
export async function POST(request: NextRequest) {
  try {
    if (!sepayEnabled()) throw new HttpError(404, "SEPAY_DISABLED", "Nguồn chưa khả dụng.");
    if (!verifySePayIpnAuthorization(request.headers.get("authorization"), process.env.FINOVA_SEPAY_BANKHUB_IPN_API_KEY)) {
      throw new HttpError(401, "INVALID_IPN_AUTH", "Xác thực IPN thất bại.");
    }
    if (request.headers.get("content-type")?.split(";")[0]?.toLowerCase() !== "application/json") {
      throw new HttpError(415, "INVALID_CONTENT_TYPE", "Cần application/json.");
    }
    const original = await readBoundedRaw(request);
    let envelope;
    try { envelope = parseSePayIpn(original); }
    catch { throw new HttpError(400, "INVALID_IPN", "Dữ liệu IPN không hợp lệ."); }
    const matches = await prisma.bankAccount.findMany({ where: { providerAccountRef: envelope.accountRef,
      status: "ACTIVE", walletId: { not: null }, connection: { providerCode: "SEPAY_BANKHUB", status: "ACTIVE" } },
      select: { connectionId: true }, take: 2 });
    if (matches.length !== 1) throw new HttpError(403, "ACCOUNT_NOT_MAPPED", "Tài khoản chưa được cho phép đồng bộ.");
    await persistBankEnvelope("SEPAY_BANKHUB", matches[0].connectionId, envelope,
      Buffer.from(JSON.stringify(envelope)), original);
    return Response.json({ success: true }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
