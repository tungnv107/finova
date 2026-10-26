import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { HttpError } from "@/server/context";
import { failure, respond } from "@/server/http";
import { pruneUsageAnalytics, usageAnalyticsEnabled } from "@/modules/admin/usage";

export async function POST(request: NextRequest) {
  try {
    if (!usageAnalyticsEnabled()) throw new HttpError(404, "USAGE_ANALYTICS_DISABLED", "Đo lường truy cập chưa bật.");
    const secret = process.env.FINOVA_CRON_SECRET ?? "";
    const auth = request.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (secret.length < 24 || token.length !== secret.length ||
        !timingSafeEqual(Buffer.from(token), Buffer.from(secret))) {
      throw new HttpError(401, "UNAUTHORIZED", "Không được chạy dọn dữ liệu truy cập.");
    }
    return respond(await pruneUsageAnalytics());
  } catch (error) { return failure(error); }
}
