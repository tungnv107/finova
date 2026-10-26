import Link from "next/link";
import { requireAdminPageRole } from "@/server/admin-page";
import { allReportingRoles } from "@/server/system-auth";
import { getAdminOverview } from "@/modules/admin/overview";

export const dynamic = "force-dynamic";
const money = (value: number) => `${new Intl.NumberFormat("vi-VN").format(value)} VNĐ`;
const number = (value: number) => new Intl.NumberFormat("vi-VN").format(value);

export default async function AdminOverviewPage() {
  const actor = await requireAdminPageRole(allReportingRoles);
  const overview = await getAdminOverview(actor.role);
  return <div>
    <div className="page-head"><div><h2 className="page-title">Tổng quan hệ thống</h2>
      <p className="subtitle">Dữ liệu ghi nhận thực tế từ đơn hàng và quyền sử dụng hiện tại.</p></div></div>
    <div className="admin-metrics">
      {overview.scope === "OVERVIEW" && <>
        <div className="card card-pad"><span className="hero-label">TỔNG NGƯỜI DÙNG</span><div className="kpi-value">{number(overview.totalUsers)}</div><p className="section-subtitle">Thêm {number(overview.newUsers30d)} trong 30 ngày</p></div>
        <div className="card card-pad"><span className="hero-label">PREMIUM CÒN HẠN</span><div className="kpi-value">{number(overview.premiumUsers)}</div><p className="section-subtitle">Lite hiện tại: {number(overview.liteUsers)}</p></div>
      </>}
      <div className="card card-pad"><span className="hero-label">CHỜ CHUYỂN KHOẢN</span><div className="kpi-value">{number(overview.pendingOrders)}</div><p className="section-subtitle">Tổng đơn hàng: {number(overview.totalOrders)}</p></div>
      <div className="card card-pad"><span className="hero-label">THU PHÍ ĐÃ PHÂN BỔ</span><div className="kpi-value">{money(overview.collectedVnd)}</div><p className="section-subtitle">Đơn đánh dấu đã thanh toán: {number(overview.paidOrders)}</p></div>
    </div>
    <div className="card card-pad" style={{ marginTop: 20 }}>
      <h3 className="section-title">Theo dõi vận hành</h3>
      <p className="subtitle" style={{ marginTop: 12 }}>Xuất tổng hợp thanh toán theo ngày Việt Nam; chỉ bao gồm số đơn và giá trị phân bổ VND, không chứa thông tin tài khoản hoặc giao dịch cá nhân.</p>
      <div className="admin-shortcuts">
        {actor.role !== "ANALYST" && <Link className="button button-outline" href="/admin/billing/analytics?days=30">Phân tích thu phí 7 / 30 / 90 ngày</Link>}
        <a className="button button-outline" href="/api/v1/admin/analytics/export?kind=billing&format=csv&days=30">Báo cáo thu phí CSV · 30 ngày</a>
        <a className="button button-outline" href="/api/v1/admin/analytics/export?kind=billing&format=xlsx&days=30">Báo cáo thu phí Excel · 30 ngày</a>
      </div>
      {overview.scope === "OVERVIEW" && (overview.traffic.status === "ACTIVE" ? <>
        <p className="subtitle" style={{ marginTop: 12 }}>Thống kê lượt xem trang của người dùng đã đăng nhập. DAU theo ngày Việt Nam; MAU là số người dùng duy nhất trong 30 ngày gần nhất. Không theo dõi truy vấn, nội dung giao dịch hay IP.</p>
        <div className="admin-metrics" style={{ marginTop: 16 }}>
          <div className="card card-pad"><span className="hero-label">DAU · HÔM NAY</span><div className="kpi-value">{number(overview.traffic.dau)}</div></div>
          <div className="card card-pad"><span className="hero-label">WAU · 7 NGÀY</span><div className="kpi-value">{number(overview.traffic.wau)}</div></div>
          <div className="card card-pad"><span className="hero-label">MAU · 30 NGÀY</span><div className="kpi-value">{number(overview.traffic.mau)}</div></div>
          <div className="card card-pad"><span className="hero-label">LƯỢT XEM TRANG · 30 NGÀY</span><div className="kpi-value">{number(overview.traffic.pageViews30d)}</div></div>
        </div>
        <div className="admin-shortcuts"><Link className="button button-outline" href="/admin/analytics">Phân tích 7 / 30 / 90 ngày</Link></div>
        <div className="table-wrap" style={{ marginTop: 16 }}><table><thead><tr><th>Ngày</th><th>Người dùng hoạt động</th><th>Lượt xem trang</th></tr></thead><tbody>
          {overview.traffic.days.map(day => <tr key={day.day}><td>{day.day}</td><td>{number(day.activeUsers)}</td><td>{number(day.pageViews)}</td></tr>)}
        </tbody></table></div>
      </> : <p className="subtitle" style={{ marginTop: 12 }}>Đo lường truy cập chưa bật vì còn chờ chính sách quyền riêng tư và cấu hình ghi nhận sự kiện. Số thu phí chỉ tổng hợp từ phân bổ thanh toán đã xác minh.</p>)}
      {(actor.role === "ADMIN" || actor.role === "SUPER_ADMIN") && <div className="admin-shortcuts">
        <Link className="button button-outline" href="/admin/users">Quản lý người dùng</Link>
        <Link className="button button-outline" href="/admin/subscriptions">Phê duyệt cấp bù Premium</Link>
        <Link className="button button-outline" href="/admin/billing/prices">Quản lý phiên bản giá</Link>
        <Link className="button button-outline" href="/admin/billing/accounts">Thiết lập ngân hàng nhận phí</Link>
      </div>}
      {actor.role !== "ANALYST" && <div className="admin-shortcuts">
        <Link className="button button-outline" href="/admin/billing/payments?review=1">Xem giao dịch cần đối soát</Link>
        <Link className="button button-outline" href="/admin/billing/operations">Theo dõi cảnh báo vận hành</Link>
      </div>}
    </div>
  </div>;
}
