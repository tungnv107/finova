import { NextRequest } from "next/server";
import { z } from "zod";
import { requireContext } from "@/server/context";
import { assertSameOrigin, failure, readJsonBody, respond } from "@/server/http";
import { suggestCategory } from "@/server/ai/classification";
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const context = await requireContext(request);
    const input = z.object({ note: z.string().trim().min(3).max(1000), kind: z.enum(["INCOME", "EXPENSE"]), useAi: z.boolean().default(false) }).strict().parse(await readJsonBody(request));
    return respond(await suggestCategory(context.workspaceId, input.note, input.kind, input.useAi));
  } catch (error) { return failure(error); }
}
