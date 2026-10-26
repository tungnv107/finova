import type { NextRequest } from "next/server";
import { requireContext } from "@/server/context";
import { failure, respond } from "@/server/http";
import { getBillingOrder } from "@/modules/billing/service";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const context = await requireContext(request); return respond(await getBillingOrder(context.userId, (await params).id)); }
  catch (error) { return failure(error); }
}
