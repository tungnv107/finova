import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireContext } from "@/server/context";
import { assertSameOrigin, failure, readJsonBody, respond } from "@/server/http";
import { listMyPremiumRegistrations, requestPremiumRegistration } from "@/modules/billing/manual-subscriptions";

const schema = z.object({ period: z.enum(["MONTH", "YEAR"]), idempotencyKey: z.string().min(8).max(128) }).strict();

export async function GET(request: NextRequest) {
  try { const context = await requireContext(request); return respond(await listMyPremiumRegistrations(context.userId)); }
  catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const context = await requireContext(request);
    const input = schema.parse(await readJsonBody(request, 2048));
    return respond(await requestPremiumRegistration(context.userId, input.period, input.idempotencyKey), 201);
  } catch (error) { return failure(error); }
}
