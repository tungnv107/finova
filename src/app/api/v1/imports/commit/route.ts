import { NextRequest } from "next/server";
import { z } from "zod";
import { requireContext } from "@/server/context";
import { assertSameOrigin, failure, respond, readJsonBody } from "@/server/http";
import { commitImport } from "@/server/imports";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const { batchId } = z.object({ batchId: z.string().min(1) }).strict().parse(await readJsonBody(request));
    return respond(await commitImport(await requireContext(request), batchId));
  } catch (error) { return failure(error); }
}
