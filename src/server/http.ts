import { NextRequest, NextResponse } from "next/server";
import { HttpError } from "@/server/context";
import { ZodError } from "zod";
import { Prisma } from "@finova/prisma";
import { configuredAppOrigin, isTrustedRequestOrigin } from "@/server/origin";

const privateHeaders = { "Cache-Control": "private, no-store, max-age=0" };
function privateJson(data: unknown, status: number) {
  return NextResponse.json(data, { status, headers: privateHeaders });
}

export function respond(data: unknown, status = 200) {
  return privateJson({ data, meta: { currency: "VND", timezone: "Asia/Ho_Chi_Minh" } }, status);
}

export function failure(error: unknown) {
  if (error instanceof HttpError) {
    const response = privateJson({ error: { code: error.code, message: error.message } }, error.status);
    if (error.status === 429) response.headers.set("Retry-After", String(error.retryAfterSeconds ?? 60));
    return response;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2034" || error.code === "P2002")) {
    return privateJson({ error: { code: "CONCURRENT_CONFLICT", message: "Có thay đổi đồng thời. Vui lòng tải lại và thử lại." } }, 409);
  }
  if (error instanceof ZodError) return privateJson({ error: { code: "VALIDATION_ERROR", message: "Dữ liệu không hợp lệ.", details: error.issues } }, 400);
  if (error instanceof Error && /Ngày không hợp lệ|Khoảng thời gian|Số tiền VND|Số tiền phải/.test(error.message)) {
    return privateJson({ error: { code: "VALIDATION_ERROR", message: error.message } }, 400);
  }
  console.error("Unhandled API error", error instanceof Error ? error.message : "unknown");
  return privateJson({ error: { code: "SERVER_ERROR", message: "Có lỗi hệ thống. Vui lòng thử lại." } }, 500);
}

export function assertSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) throw new HttpError(403, "ORIGIN_REQUIRED", "Yêu cầu thiếu Origin.");
  const expected = configuredAppOrigin();
  if (!expected) throw new HttpError(503, "ORIGIN_NOT_CONFIGURED", "Nguồn ứng dụng chưa được cấu hình hợp lệ.");
  if (!isTrustedRequestOrigin(origin, expected)) throw new HttpError(403, "INVALID_ORIGIN", "Nguồn yêu cầu không hợp lệ.");
}

/** Limit JSON request bodies before parsing and classify only actual parse failures as input errors. */
export async function readJsonBody(request: NextRequest, maxBytes = 64 * 1024) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (declaredLength > maxBytes) throw new HttpError(413, "SIZE", "Nội dung yêu cầu quá lớn.");
  if (!request.body) throw new HttpError(400, "INVALID_JSON", "Nội dung JSON không hợp lệ.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new HttpError(413, "SIZE", "Nội dung yêu cầu quá lớn.");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof TypeError) {
      throw new HttpError(400, "INVALID_JSON", "Nội dung JSON không hợp lệ.");
    }
    throw error;
  }
}

/** Enforce multipart payload size while reading, even with no Content-Length. */
export async function limitedFormData(request: NextRequest, maxBytes: number) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
    throw new HttpError(415, "CONTENT_TYPE", "Yêu cầu phải là multipart/form-data.");
  }
  if (Number(request.headers.get("content-length") || 0) > maxBytes) {
    throw new HttpError(413, "SIZE", "Tệp quá lớn.");
  }
  if (!request.body) throw new HttpError(400, "EMPTY_BODY", "Không có dữ liệu tải lên.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new HttpError(413, "SIZE", "Tệp quá lớn.");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new Response(bytes.buffer, { headers: { "Content-Type": contentType } }).formData();
}
