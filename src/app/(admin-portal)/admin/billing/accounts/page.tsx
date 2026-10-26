import { AdminReceivingAccounts } from "@/components/admin-receiving-accounts";
import { prisma } from "@/lib/db";
import { listReceivingAccounts } from "@/modules/billing/service";
import { requireAdminPageRole } from "@/server/admin-page";
import { userManagementRoles } from "@/server/system-auth";

export const dynamic = "force-dynamic";

export default async function ReceivingAccountsPage() {
  const actor = await requireAdminPageRole(userManagementRoles);
  const [accounts, audits] = await Promise.all([
    listReceivingAccounts(),
    prisma.adminAuditLog.findMany({ where: { resourceType: "RECEIVING_ACCOUNT" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 30,
      select: { id: true, actorId: true, action: true, resourceId: true, createdAt: true } }),
  ]);
  return <div><div className="page-head"><div><h2 className="page-title">Ngân hàng nhận phí</h2>
    <p className="subtitle">Thiết lập tài khoản nhận chuyển khoản Premium với cơ chế phê duyệt hai người.</p></div></div>
    <AdminReceivingAccounts accounts={JSON.parse(JSON.stringify(accounts))} actorId={actor.userId}
      canApprove={actor.role === "SUPER_ADMIN"} audits={JSON.parse(JSON.stringify(audits))} />
    <p className="section-subtitle">Chưa mở luồng thu tiền tự động cho đến khi kết nối nhà cung cấp thanh toán, kiểm thử đối soát và nghiệm thu.</p>
  </div>;
}
