import { NextRequest } from "next/server";
import { requireContext } from "@/server/context";
import { assertSameOrigin, failure, respond, readJsonBody } from "@/server/http";
import { createCategory, listCategories } from "@/server/categories";

export async function GET(request: NextRequest) {
  try {
    const { workspaceId } = await requireContext();
    return respond(await listCategories(workspaceId, request.nextUrl.searchParams.get("includeArchived") === "true"));
  } catch (e) { return failure(e); }
}

export async function POST(request: NextRequest) {
  try { assertSameOrigin(request); return respond(await createCategory(await requireContext(request), await readJsonBody(request)), 201); }
  catch (e) { return failure(e); }
}
