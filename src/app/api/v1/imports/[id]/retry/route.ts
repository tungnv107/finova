import { NextRequest } from "next/server";
import { requireContext } from "@/server/context";
import { assertSameOrigin, failure, respond } from "@/server/http";
import { retryFailedImport } from "@/server/imports";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    return respond(await retryFailedImport(await requireContext(request), (await params).id));
  } catch (error) { return failure(error); }
}
