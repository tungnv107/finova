import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { NextRequest } from "next/server";
import { HttpError } from "@/server/context";
import { failure, readJsonBody, respond } from "@/server/http";
import { consumeRateLimitKey } from "@/server/rate-limit";
import { replayBankDeadLetter } from "@/modules/bank-sync/service";

const input = z.object({
  workspaceId: z.string().min(1).max(128),
  eventId: z.string().min(1).max(128),
  reasonCode: z.enum(["SOURCE_RESTORED", "TRANSIENT_FAILURE", "OPERATOR_REVIEWED"]),
}).strict();

/** Operator-only recovery; independent from the scheduler bearer secret. */
export async function POST(request: NextRequest) {
  try {
    const secret = process.env.FINOVA_BANK_REPLAY_SECRET;
    const bearer = request.headers.get("authorization") ?? "";
    const provided = bearer.startsWith("Bearer ") ? bearer.slice(7) : "";
    if (!secret || secret.length < 32 || provided.length !== secret.length ||
        !timingSafeEqual(Buffer.from(provided), Buffer.from(secret))) {
      throw new HttpError(401, "UNAUTHORIZED", "Không có quyền khôi phục hàng đợi ngân hàng.");
    }
    await consumeRateLimitKey("finova-internal-bank-replay", "scheduler");
    const body = input.parse(await readJsonBody(request, 2048));
    return respond(await replayBankDeadLetter(body.workspaceId, body.eventId, body.reasonCode));
  } catch (error) { return failure(error); }
}
