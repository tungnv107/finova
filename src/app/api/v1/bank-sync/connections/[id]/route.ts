import { NextRequest } from "next/server";
import { z } from "zod";
import { HttpError } from "@/server/context";
import { requireBankSyncContext } from "@/server/premium";
import { assertSameOrigin, failure, readJsonBody, respond } from "@/server/http";
import { serializable } from "@/server/serializable";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const context = await requireBankSyncContext(request);
    const { id } = await params;
    const { action } = z.object({ action: z.enum(["PAUSE", "RESUME", "REVOKE"]) }).strict().parse(await readJsonBody(request));
    const result = await serializable(async db => {
      const connection = await db.bankConnection.findFirst({ where: { id, workspaceId: context.workspaceId },
        include: { consents: { where: { revokedAt: null } } } });
      if (!connection) throw new HttpError(404, "NOT_FOUND", "Không tìm thấy kết nối.");
      if (connection.status === "REVOKED") throw new HttpError(409, "REVOKED", "Kết nối đã bị thu hồi.");
      if (action === "RESUME" && (!connection.consents.length || connection.consents.every(c => c.expiresAt && c.expiresAt <= new Date()))) {
        throw new HttpError(409, "CONSENT_EXPIRED", "Cần cấp quyền hợp lệ trước khi tiếp tục.");
      }
      const status = action === "PAUSE" ? "PAUSED" : action === "RESUME" ? "ACTIVE" : "REVOKED";
      await db.bankConnection.update({ where: { id }, data: { status } });
      if (action === "REVOKE") {
        await db.bankConsent.updateMany({ where: { connectionId: id, workspaceId: context.workspaceId, revokedAt: null }, data: { revokedAt: new Date() } });
        // Explicit revocation retires the mapping and frees the wallet for a
        // future verified connection. The statement/ledger audit remains intact.
        await db.bankAccount.updateMany({ where: { connectionId: id, workspaceId: context.workspaceId, status: "ACTIVE" },
          data: { status: "INACTIVE" } });
      }
      await db.bankAuditEvent.create({ data: { workspaceId: context.workspaceId, actorType: "USER", actorId: context.userId,
        action, resourceType: "CONNECTION", resourceId: id } });
      return { id, status };
    });
    return respond(result);
  } catch (error) { return failure(error); }
}
