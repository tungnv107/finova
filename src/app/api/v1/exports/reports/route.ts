import { NextRequest } from "next/server";
import { z } from "zod";
import { requireContext } from "@/server/context";
import { assertSameOrigin, failure, readJsonBody } from "@/server/http";
import { sendExport } from "@/server/export-http";

const inputSchema = z.object({
  format: z.enum(["csv", "xlsx", "pdf"]),
  start: z.iso.date().optional(), endExclusive: z.iso.date().optional(),
  walletId: z.string().optional(), categoryId: z.string().optional(),
}).strict();

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const { workspaceId } = await requireContext(request);
    const { format, ...filter } = inputSchema.parse(await readJsonBody(request));
    return await sendExport(workspaceId, format, filter);
  } catch (error) { return failure(error); }
}
