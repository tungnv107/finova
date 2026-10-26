import type { NextRequest } from "next/server";
import { requireSystemRole } from "@/server/system-auth";
import { assertSameOrigin, failure, respond } from "@/server/http";
import { approveReceivingAccount } from "@/modules/billing/service";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { assertSameOrigin(request); const actor = await requireSystemRole(["SUPER_ADMIN"], request);
    return respond(await approveReceivingAccount(actor, (await params).id)); }
  catch (error) { return failure(error); }
}
