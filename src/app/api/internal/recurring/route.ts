import { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { failure, respond } from "@/server/http";
import { HttpError } from "@/server/context";
import { syncAllRecurring } from "@/server/recurring";
import { consumeRateLimitKey, pruneExpiredRateLimits } from "@/server/rate-limit";

export async function POST(request: NextRequest) {
  try {
    const configured = process.env.FINOVA_CRON_SECRET;
    const header = request.headers.get("authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!configured || configured.length < 24 || token.length !== configured.length || !timingSafeEqual(Buffer.from(token), Buffer.from(configured))) {
      throw new HttpError(401, "UNAUTHORIZED", "Không có quyền chạy scheduler.");
    }
    await consumeRateLimitKey("finova-internal-recurring", "scheduler");
    const result = await syncAllRecurring();
    await pruneExpiredRateLimits();
    return respond(result);
  } catch (error) { return failure(error); }
}
