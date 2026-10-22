import { NextRequest } from "next/server";
import { requireContext } from "@/server/context";
import { assertSameOrigin, failure, respond } from "@/server/http";
import { listNotifications, reconcileNotifications } from "@/server/notifications";

export async function GET() {
  try { const { workspaceId } = await requireContext(); return respond(await listNotifications(workspaceId)); }
  catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try { assertSameOrigin(request); const { workspaceId } = await requireContext(request); await reconcileNotifications(workspaceId); return respond(await listNotifications(workspaceId)); }
  catch (error) { return failure(error); }
}
