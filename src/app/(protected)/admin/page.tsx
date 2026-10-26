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
    <section className="admin-insights" aria-label="Lối tắt quản trị">
      <h3 className="section-title">Công việc thường dùng</h3>
      <div className="admin-quick-grid">
        {(actor.role === "ADMIN" || actor.role === "SUPER_ADMIN") && <>
          <Link className="admin-quick-card" href="/admin/subscriptions"><strong>Duyệt yêu cầu Premium</strong><span>Xem đăng ký mới và quyết định cấp quyền.</span></Link>
          <Link className="admin-quick-card" href="/admin/users"><strong>Quản lý người dùng</strong><span>Tra cứu tài khoản, gói và trạng thái truy cập.</span></Link>
          <Link className="admin-quick-card" href="/admin/billing/accounts"><strong>Tài khoản nhận tiền</strong><span>Thiết lập, phê duyệt ngân hàng thụ hưởng.</span></Link>
        </>}
        {actor.role !== "ANALYST" && <>
          <Link className="admin-quick-card" href="/admin/billing/payments?review=1"><strong>Đối soát thanh toán</strong><span>Kiểm tra giao dịch và các khoản chưa khớp.</span></Link>
          <Link className="admin-quick-card" href="/admin/billing/operations"><strong>Cảnh báo vận hành</strong><span>Rà soát sự cố và tình trạng xử lý.</span></Link>
          <Link className="admin-quick-card" href="/admin/billing/analytics?days=30"><strong>Phân tích thu phí</strong><span>Báo cáo 7, 30 và 90 ngày.</span></Link>
        </>}
        {actor.role === "ANALYST" && <Link className="admin-quick-card" href="/admin/analytics"><strong>Phân tích sử dụng</strong><span>Thống kê lượt truy cập và xu hướng hoạt động.</span></Link>}
      </div>
    </section>
    <details className="admin-insights card card-pad">
      <summary>Báo cáo và dữ liệu chi tiết</summary>
      <p className="subtitle">Thống kê tổng hợp, không chứa ví, số tài khoản hoặc giao dịch tài chính cá nhân.</p>
      {actor.role !== "ANALYST" && <p><a className="text-link" href="/api/v1/admin/analytics/export?kind=billing&format=csv&days=30">Tải CSV 30 ngày</a> · <a className="text-link" href="/api/v1/admin/analytics/export?kind=billing&format=xlsx&days=30">Tải Excel 30 ngày</a></p>}
      {overview.scope === "OVERVIEW" && (overview.traffic.status === "ACTIVE" ? <>
        <p className="subtitle" style={{ marginTop: 12 }}>Thống kê lượt xem trang của người dùng đã đăng nhập. DAU theo ngày Việt Nam; MAU là số người dùng duy nhất trong 30 ngày gần nhất. Không theo dõi truy vấn, nội dung giao dịch hay IP.</p>
        <div className="admin-metrics" style={{ marginTop: 16 }}>
          <div className="card card-pad"><span className="hero-label">DAU · HÔM NAY</span><div className="kpi-value">{number(overview.traffic.dau)}</div></div>
          <div className="card card-pad"><span className="hero-label">WAU · 7 NGÀY</span><div className="kpi-value">{number(overview.traffic.wau)}</div></div>
          <div className="card card-pad"><span className="hero-label">MAU · 30 NGÀY</span><div className="kpi-value">{number(overview.traffic.mau)}</div></div>
          <div className="card card-pad"><span className="hero-label">LƯỢT XEM TRANG · 30 NGÀY</span><div className="kpi-value">{number(overview.traffic.pageViews30d)}</div></div>
        </div>
        <p><Link className="text-link" href="/admin/analytics">Mở phân tích truy cập</Link></p>
        <div className="table-wrap" style={{ marginTop: 16 }}><table><thead><tr><th>Ngày</th><th>Người dùng hoạt động</th><th>Lượt xem trang</th></tr></thead><tbody>
          {overview.traffic.days.map(day => <tr key={day.day}><td>{day.day}</td><td>{number(day.activeUsers)}</td><td>{number(day.pageViews)}</td></tr>)}
        </tbody></table></div>
      </> : <p className="subtitle" style={{ marginTop: 12 }}>Đo lường truy cập chưa bật vì còn chờ chính sách quyền riêng tư và cấu hình ghi nhận sự kiện. Số thu phí chỉ tổng hợp từ phân bổ thanh toán đã xác minh.</p>)}
    </details>
  </div>;
}
