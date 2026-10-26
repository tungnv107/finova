import type { NextRequest } from "next/server";
import { z } from "zod";
import { usageAnalyticsEnabled, recordAuthenticatedPageview } from "@/modules/admin/usage";
import { usageRouteGroups } from "@/modules/admin/usage-domain";
import { requireContext } from "@/server/context";
import { assertSameOrigin, failure, readJsonBody, respond } from "@/server/http";

const payload = z.object({ navigationId: z.string().uuid(), routeGroup: z.enum(usageRouteGroups) }).strict();

export async function POST(request: NextRequest) {
  try {
    if (!usageAnalyticsEnabled()) return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
    assertSameOrigin(request);
    const context = await requireContext(request);
    // No unauthenticated analytics, bot user agents, financial details, raw URL or IP retention.
    if (/bot|crawler|spider|headless/i.test(request.headers.get("user-agent") ?? "")) {
      return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
    }
    const body = payload.parse(await readJsonBody(request, 2048));
    return respond(await recordAuthenticatedPageview(context.userId, body.navigationId, body.routeGroup));
  } catch (error) { return failure(error); }
}
