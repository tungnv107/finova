import { NextRequest } from "next/server";
import { requireContext } from "@/server/context";
import { assertSameOrigin, failure, respond, readJsonBody } from "@/server/http";
import { updateWallet } from "@/server/ledger";
import { walletLedgerDetail } from "@/server/wallet-detail";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { workspaceId } = await requireContext(request);
    return respond(await walletLedgerDetail(workspaceId, (await params).id, request.nextUrl.searchParams.get("asOf"), request.nextUrl.searchParams.get("cursor")));
  } catch (e) { return failure(e); }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { assertSameOrigin(request); const context = await requireContext(request); return respond(await updateWallet(context, (await params).id, await readJsonBody(request))); } catch (e) { return failure(e); }
}
