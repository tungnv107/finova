import { NextRequest } from "next/server";
import { requireContext } from "@/server/context";
import { updateCategory } from "@/server/categories";
import { assertSameOrigin, failure, respond, readJsonBody } from "@/server/http";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    return respond(await updateCategory(await requireContext(request), id, await readJsonBody(request)));
  } catch (e) { return failure(e); }
}
