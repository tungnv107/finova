import { timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { HttpError } from "@/server/context";
import { failure, respond } from "@/server/http";
import { consumeRateLimitKey } from "@/server/rate-limit";
import { processBankOutbox } from "@/modules/bank-sync/service";

export async function POST(request: NextRequest) {
  try {
    const secret = process.env.FINOVA_CRON_SECRET;
    const bearer = request.headers.get("authorization") ?? "";
    const provided = bearer.startsWith("Bearer ") ? bearer.slice(7) : "";
    if (!secret || secret.length < 24 || provided.length !== secret.length ||
        !timingSafeEqual(Buffer.from(provided), Buffer.from(secret))) {
      throw new HttpError(401, "UNAUTHORIZED", "Không được chạy worker.");
    }
    await consumeRateLimitKey("finova-internal-bank-sync", "scheduler");
    return respond(await processBankOutbox());
  } catch (error) { return failure(error); }
}
