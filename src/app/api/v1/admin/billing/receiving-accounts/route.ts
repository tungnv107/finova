import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireSystemRole, userManagementRoles } from "@/server/system-auth";
import { assertSameOrigin, failure, readJsonBody, respond } from "@/server/http";
import { listReceivingAccounts, proposeReceivingAccount } from "@/modules/billing/service";

const bankInput = z.object({ bankCode: z.string().trim().min(2).max(16).regex(/^[A-Z0-9_-]+$/),
  bankName: z.string().trim().min(2).max(100), accountName: z.string().trim().min(3).max(120),
  accountNumber: z.string().regex(/^\d{8,20}$/) }).strict();

export async function GET(request: NextRequest) {
  try { await requireSystemRole(userManagementRoles, request); return respond(await listReceivingAccounts()); }
  catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try { assertSameOrigin(request); const actor = await requireSystemRole(userManagementRoles, request);
    return respond(await proposeReceivingAccount(actor, bankInput.parse(await readJsonBody(request))), 201); }
  catch (error) { return failure(error); }
}
