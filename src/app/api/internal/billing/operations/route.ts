import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { runBillingOperationalSweep, billingOperationalMonitorEnabled } from "@/modules/admin/billing-operational-monitor";
import { processBillingOperationalRelay } from "@/modules/admin/billing-operational-relay";
import { HttpError } from "@/server/context";
import { failure, respond } from "@/server/http";

/** Call from an independent scheduler every five minutes. Keep the secret server-only. */
export async function POST(request: NextRequest) {
  try {
    if (!billingOperationalMonitorEnabled()) throw new HttpError(404, "ALERT_MONITOR_DISABLED", "Chưa bật giám sát.");
    const secret = process.env.FINOVA_CRON_SECRET ?? "";
    const auth = request.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (secret.length < 24 || token.length !== secret.length ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(secret))) {
      throw new HttpError(401, "UNAUTHORIZED", "Không được chạy giám sát vận hành.");
    }
    const sweep = await runBillingOperationalSweep();
    const relay = await processBillingOperationalRelay();
    return respond({ ...sweep, relay });
  } catch (error) { return failure(error); }
}
