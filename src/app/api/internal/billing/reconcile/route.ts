import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { HttpError } from "@/server/context";
import { failure, respond } from "@/server/http";
import { consumeRateLimitKey } from "@/server/rate-limit";
import { processPendingVerifiedBillingCredits } from "@/modules/billing/reconciliation";
import { processPendingBillingNotices } from "@/modules/billing/outbox";
import { sepayBillingWebhookEnabled } from "@/modules/billing/sepay-webhook";

export async function POST(request: NextRequest) {
  try {
    if (!sepayBillingWebhookEnabled()) throw new HttpError(404, "BILLING_WORKER_DISABLED", "Đối soát chưa mở.");
    const secret = process.env.FINOVA_CRON_SECRET ?? "";
    const auth = request.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (secret.length < 24 || token.length !== secret.length ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(secret))) {
      throw new HttpError(401, "UNAUTHORIZED", "Không được chạy đối soát tự động.");
    }
    await consumeRateLimitKey("finova-internal-billing", "scheduler");
    const reconciliation = await processPendingVerifiedBillingCredits(20);
    const notices = await processPendingBillingNotices(20);
    return respond({ ...reconciliation, notices });
  } catch (error) { return failure(error); }
}
