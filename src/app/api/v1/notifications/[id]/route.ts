import { NextRequest } from "next/server";
import { requireNotificationsContext } from "@/server/premium";
import { z } from "zod";
import { assertSameOrigin, failure, respond, readJsonBody } from "@/server/http";
import { markNotification } from "@/server/notifications";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { assertSameOrigin(request); const { workspaceId } = await requireNotificationsContext(request); const { read } = z.object({ read: z.boolean().optional() }).strict().parse(await readJsonBody(request)); return respond(await markNotification(workspaceId, (await params).id, read !== false)); }
  catch (error) { return failure(error); }
}
