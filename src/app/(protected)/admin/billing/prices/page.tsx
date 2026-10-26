import { AdminPriceVersions } from "@/components/admin-price-versions";
import { prisma } from "@/lib/db";
import { listAdminPriceVersions } from "@/modules/billing/catalog-admin";
import { requireAdminPageRole } from "@/server/admin-page";
import { userManagementRoles } from "@/server/system-auth";

export const dynamic = "force-dynamic";
export default async function AdminPricesPage() {
  const actor = await requireAdminPageRole(userManagementRoles);
  const [prices, audits] = await Promise.all([
    listAdminPriceVersions(actor),
    prisma.adminAuditLog.findMany({ where: { resourceType: "PLAN_PRICE" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 30,
      select: { id: true, actorId: true, action: true, resourceId: true, createdAt: true } }),
  ]);
  return <div>
    <div className="page-head"><div><h2 className="page-title">Quản lý bảng giá Premium</h2>
      <p className="subtitle">Tạo bản nháp, điều chỉnh và công bố phiên bản giá có lưu nhật ký.</p></div></div>
    <AdminPriceVersions prices={JSON.parse(JSON.stringify(prices))} audits={JSON.parse(JSON.stringify(audits))} />
  </div>;
}
