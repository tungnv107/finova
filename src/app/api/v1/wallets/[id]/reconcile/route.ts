import { NextRequest } from "next/server";
import { requireContext } from "@/server/context";
import { assertSameOrigin, failure, respond, readJsonBody } from "@/server/http";
import { listWalletReconciliations, reconcileWallet } from "@/server/wallet-reconciliation";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const context = await requireContext(request); return respond(await listWalletReconciliations(context.workspaceId, (await params).id)); }
  catch (error) { return failure(error); }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const context = await requireContext(request);
    return respond(await reconcileWallet(context, (await params).id, await readJsonBody(request)), 201);
  } catch (error) { return failure(error); }
}
