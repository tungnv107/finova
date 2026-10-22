import { timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { HttpError } from "@/server/context";
import { failure, respond } from "@/server/http";
import { consumeRateLimitKey } from "@/server/rate-limit";
import { pollActiveSePayConnections } from "@/modules/bank-sync/sepay/service";
import { processBankOutbox } from "@/modules/bank-sync/service";

export async function POST(request: NextRequest) {
  try {
    const secret = process.env.FINOVA_CRON_SECRET;
    const auth = request.headers.get("authorization") ?? "";
    const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!secret || secret.length < 24 || provided.length !== secret.length ||
        !timingSafeEqual(Buffer.from(provided), Buffer.from(secret))) {
      throw new HttpError(401, "UNAUTHORIZED", "Không được chạy đồng bộ tự động.");
    }
    await consumeRateLimitKey("finova-internal-sepay-bankhub", "scheduler");
    const sync = await pollActiveSePayConnections();
    // The scheduled job also advances durable events into the review inbox.
    // IPN-only arrivals are processed even if the history provider is disabled.
    const inbox = await processBankOutbox(20);
    return respond({ ...sync, inbox });
  } catch (error) { return failure(error); }
}
