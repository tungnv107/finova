import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireContext } from "@/server/context";
import { assertSameOrigin, failure, readJsonBody, respond } from "@/server/http";
import { createBillingOrder, listBillingOrders } from "@/modules/billing/service";

export async function GET(request: NextRequest) {
  try { const context = await requireContext(request); return respond(await listBillingOrders(context.userId)); }
  catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const context = await requireContext(request);
    const { priceId } = z.object({ priceId: z.string().min(1) }).strict().parse(await readJsonBody(request));
    return respond(await createBillingOrder(context.userId, priceId, request.headers.get("Idempotency-Key") ?? ""), 201);
  } catch (error) { return failure(error); }
}
