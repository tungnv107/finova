import { NextRequest } from "next/server";
import { createWallet, walletBalances } from "@/server/ledger";
import { requireContext } from "@/server/context";
import { assertSameOrigin, failure, respond, readJsonBody } from "@/server/http";
import { walletCutoff } from "@/server/wallet-detail";

export async function GET(request: NextRequest) {
  try { const { workspaceId } = await requireContext(request); return respond(await walletBalances(workspaceId, walletCutoff(request.nextUrl.searchParams.get("asOf")))); } catch (e) { return failure(e); }
}
export async function POST(request: NextRequest) {
  try { assertSameOrigin(request); const context = await requireContext(request); return respond(await createWallet(context, await readJsonBody(request)), 201); } catch (e) { return failure(e); }
}
