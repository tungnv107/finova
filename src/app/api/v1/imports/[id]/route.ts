import { requireContext } from "@/server/context";
import { failure, respond } from "@/server/http";
import { getImport } from "@/server/imports";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const { workspaceId } = await requireContext(); return respond(await getImport(workspaceId, (await params).id)); }
  catch (error) { return failure(error); }
}
