import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/server/auth";
import { configuredAppOrigin } from "@/server/origin";
import { NextRequest, NextResponse } from "next/server";
import { limitAuthRequest } from "@/server/rate-limit";
import { failure } from "@/server/http";

const handlers = toNextJsHandler(auth);
function unavailable() {
  return NextResponse.json({ error: { code: "ORIGIN_NOT_CONFIGURED", message: "Nguồn đăng nhập chưa được cấu hình." } },
    { status: 503, headers: { "Cache-Control": "private, no-store, max-age=0" } });
}
export async function GET(request: NextRequest) {
  if (!configuredAppOrigin()) return unavailable();
  try {
    await limitAuthRequest(request);
    return await handlers.GET(request);
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  if (!configuredAppOrigin()) return unavailable();
  try {
    await limitAuthRequest(request);
    return await handlers.POST(request);
  } catch (error) { return failure(error); }
}
