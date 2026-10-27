import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminAccessForm } from "@/components/admin-access-form";
import { AdminManualGrantForm, AdminManualRevoke } from "@/components/admin-subscription-actions";
import { getAdminUser } from "@/modules/admin/users";
import { requireAdminPageRole } from "@/server/admin-page";
import { HttpError } from "@/server/context";
import { userManagementRoles } from "@/server/system-auth";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { StatusBadge } from "@/components/ui/interaction-controls";

export const dynamic = "force-dynamic";
const vnDate = (value: Date | null) => value ? new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "medium", timeStyle: "short" }).format(value) : "—";

export default async function AdminUserDetail({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAdminPageRole(userManagementRoles);
  let user: Awaited<ReturnType<typeof getAdminUser>>;
  try { user = await getAdminUser((await params).id); }
  catch (error) { if (error instanceof HttpError && error.status === 404) notFound(); throw error; }
  const protectedTarget = actor.userId === user.id || user.systemRoles.some(r => r.role === "SUPER_ADMIN") ||
    (actor.role !== "SUPER_ADMIN" && user.systemRoles.some(r => r.role === "ADMIN"));
  return <div>
    <div className="page-head"><div><h2 className="page-title">{user.name}</h2><p className="subtitle">{user.email}</p></div>
      <Link className="v4-admin-record-link" href="/admin/users"><ArrowLeft size={16} aria-hidden="true" />Quay lại danh sách</Link></div>
    <div className="grid-half admin-detail-grid">
      <section className="card card-pad"><h3 className="section-title">Hồ sơ và gói tài khoản</h3>
        <div className="legend-list">
          <div className="legend-row"><span>Trạng thái</span><StatusBadge tone={user.accessState.status === "ACTIVE" ? "success" : "warning"}>{user.accessState.status}</StatusBadge></div>
          <div className="legend-row"><span>Gói</span><StatusBadge tone={user.plan === "PREMIUM" ? "success" : "neutral"}>{user.plan}</StatusBadge></div>
          <div className="legend-row"><span>Ngày hết hạn Premium</span><strong>{vnDate(user.premiumExpiresAt)}</strong></div>
          <div className="legend-row"><span>Đăng ký</span><strong>{vnDate(user.createdAt)}</strong></div>
          <div className="legend-row"><span>Hoạt động ghi nhận gần nhất</span><strong>{vnDate(user.lastSeenAt)}</strong></div>
          <div className="legend-row"><span>Vai trò hệ thống</span><strong>{user.systemRoles.map(r => r.role).join(", ") || "USER"}</strong></div>
        </div></section>
      <section className="card card-pad"><h3 className="section-title">Quản lý quyền truy cập</h3>
        {protectedTarget ? <p className="subtitle" style={{ marginTop: 14 }}>Tài khoản quản trị được bảo vệ. Không thể thay đổi trạng thái qua chức năng này.</p> :
          <AdminAccessForm userId={user.id} currentStatus={user.accessState.status} />}
      </section>
    </div>
    <section className="card card-pad" style={{ marginTop: 20 }}><h3 className="section-title">Đề xuất cấp bù Premium</h3>
      {!protectedTarget && user.accessState.status === "ACTIVE" ? <AdminManualGrantForm userId={user.id} /> :
        <p className="section-subtitle">Không tạo đề xuất cho tài khoản quản trị được bảo vệ hoặc người dùng bị khóa.</p>}
      <Link className="v4-admin-record-link" href="/admin/subscriptions">Xem hàng chờ phê duyệt<ChevronRight size={16} aria-hidden="true" /></Link>
    </section>
    <section className="card card-pad" style={{ marginTop: 20 }}><h3 className="section-title">Lịch sử cấp quyền Premium</h3>
      <div className="table-wrap"><table><thead><tr><th>Nguồn</th><th>Bắt đầu</th><th>Hết hạn</th><th>Tình trạng</th><th>Thao tác</th></tr></thead><tbody>
        {user.subscriptionGrants.map(g => <tr key={g.id}><td>{g.grantType}</td><td>{vnDate(g.startsAt)}</td><td>{vnDate(g.expiresAt)}</td><td><StatusBadge tone={g.revokedAt || g.expiresAt <= new Date() ? "neutral" : g.startsAt > new Date() ? "warning" : "success"}>{g.revokedAt ? "Đã thu hồi" : g.startsAt > new Date() ? "Đã lên lịch" : g.expiresAt <= new Date() ? "Đã hết hạn" : "Đang hiệu lực"}</StatusBadge></td>
          <td>{!protectedTarget && g.grantType === "MANUAL" && !g.revokedAt && g.expiresAt > new Date() ? <AdminManualRevoke grantId={g.id} /> : "—"}</td></tr>)}
      </tbody></table>{!user.subscriptionGrants.length && <p className="section-subtitle">Chưa có lịch sử cấp Premium.</p>}</div></section>
    <section className="card card-pad" style={{ marginTop: 20 }}><h3 className="section-title">Đơn hàng Premium gần đây</h3>
      <div className="table-wrap"><table><thead><tr><th>Mã đơn</th><th>Ngày tạo</th><th>Giá trị</th><th>Trạng thái</th></tr></thead><tbody>
        {user.billingOrders.map(o => <tr key={o.id}><td>{o.orderCode}</td><td>{vnDate(o.createdAt)}</td><td>{new Intl.NumberFormat("vi-VN").format(o.amountDueVnd)} VNĐ</td><td>{o.status}</td></tr>)}
      </tbody></table>{!user.billingOrders.length && <p className="section-subtitle">Chưa phát sinh đơn hàng.</p>}</div>
      <p className="section-subtitle">Chức năng quản trị không truy vấn ví, sao kê hoặc giao dịch tài chính riêng tư.</p></section>
    <section className="card card-pad" style={{ marginTop: 20 }}><h3 className="section-title">Dòng thời gian vòng đời tài khoản và Premium</h3>
      <p className="section-subtitle">Tối đa 25 sự kiện cấp quyền và 25 thay đổi trạng thái; không chứa lý do nhạy cảm hoặc giao dịch cá nhân.</p>
      <div className="table-wrap"><table><thead><tr><th>Thời điểm (VN)</th><th>Nhóm</th><th>Sự kiện</th></tr></thead><tbody>
        {[
          ...user.subscriptionEvents.map(e => ({ id: e.id, createdAt: e.createdAt, category: "Premium", label: e.kind })),
          ...user.accessEvents.map(e => ({ id: e.id, createdAt: e.createdAt, category: "Tài khoản", label: e.status })),
        ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map(e => <tr key={`${e.category}-${e.id}`}>
          <td>{vnDate(e.createdAt)}</td><td>{e.category}</td><td>{e.label}</td>
        </tr>)}
      </tbody></table></div>
      {!user.subscriptionEvents.length && !user.accessEvents.length && <p className="section-subtitle">Chưa có sự kiện vòng đời.</p>}
    </section>
  </div>;
}
