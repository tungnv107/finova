import { NextRequest } from "next/server";
import { requireContext } from "@/server/context";
import { assertSameOrigin, failure, readJsonBody, respond } from "@/server/http";
import { resolveBankReview } from "@/modules/bank-sync/service";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const context = await requireContext(request);
    const { id } = await params;
    return respond(await resolveBankReview(context, id, await readJsonBody(request)));
  } catch (error) { return failure(error); }
}
