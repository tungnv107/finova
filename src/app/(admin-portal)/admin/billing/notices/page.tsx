import { prisma } from "@/lib/db";
import { requireAdminPageRole } from "@/server/admin-page";
import { AdminBillingNoticeRequeue } from "@/components/admin-billing-notice-requeue";
import { AdminBillingSubnav } from "@/components/admin-billing-subnav";

export const dynamic = "force-dynamic";

export default async function AdminBillingNoticesPage() {
  await requireAdminPageRole(["SUPER_ADMIN", "ADMIN", "FINANCE_OPERATOR"]);
  const where = { status: "PENDING", deadLetteredAt: { not: null } };
  const [total, rows] = await Promise.all([
    prisma.billingOutbox.count({ where }),
    prisma.billingOutbox.findMany({ where, orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 30, select: { id: true, orderId: true, attemptCount: true, lastErrorCode: true, createdAt: true } }),
  ]);
  return <div>
    <div className="page-head"><div><h2 className="page-title">Thông báo kích hoạt cần xử lý</h2>
      <p className="subtitle">Thông báo nội bộ được ghi cùng giao dịch cấp quyền Premium. Gửi thất bại sẽ thử lại theo lịch và vào DLQ sau 6 lần.</p>
    </div></div>
    <AdminBillingSubnav active="notices" />
    <section className="card card-pad">
      <h3 className="section-title">Hàng lỗi ({total})</h3>
      {rows.length === 0 ? <p className="section-subtitle">Không có thông báo đang chờ xử lý thủ công.</p> :
        <div className="table-wrap"><table><thead><tr><th>Mã đơn</th><th>Đã thử</th><th>Mã lỗi</th><th>Khôi phục có ghi audit</th></tr></thead>
          <tbody>{rows.map(item => <tr key={item.id}><td>{item.orderId}</td><td>{item.attemptCount}</td>
            <td>{item.lastErrorCode ?? "Không xác định"}</td><td><AdminBillingNoticeRequeue id={item.id} /></td></tr>)}</tbody>
        </table></div>}
      {total > rows.length && <p className="section-subtitle">Hiển thị 30 thông báo lâu nhất. API quản trị hỗ trợ phân trang.</p>}
    </section>
  </div>;
}
