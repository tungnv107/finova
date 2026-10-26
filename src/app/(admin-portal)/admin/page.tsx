import Link from "next/link";
import { ArrowUpRight, BellRing, CreditCard, ShieldCheck, UsersRound } from "lucide-react";
import { requireAdminPageRole } from "@/server/admin-page";
import { allReportingRoles } from "@/server/system-auth";
import { getAdminOverview } from "@/modules/admin/overview";

export const dynamic = "force-dynamic";
const money = (value: number) => new Intl.NumberFormat("vi-VN").format(value) + " VNĐ";
const number = (value: number) => new Intl.NumberFormat("vi-VN").format(value);

function TaskRow({ href, title, description, icon: Icon }: {
  href: string; title: string; description: string; icon: typeof CreditCard;
}) {
  return <div className="admin-task-row">
    <span className="admin-task-mark"><Icon size={18} aria-hidden="true" /></span>
    <div className="admin-task-text"><strong>{title}</strong><span>{description}</span></div>
    <Link href={href} aria-label={"Mở " + title}><span>Mở</span><ArrowUpRight size={15} aria-hidden="true" /></Link>
  </div>;
}

export default async function AdminOverviewPage() {
  const actor = await requireAdminPageRole(allReportingRoles);
  const overview = await getAdminOverview(actor.role);
  const isManager = actor.role === "ADMIN" || actor.role === "SUPER_ADMIN";
  const canBill = actor.role !== "ANALYST";
  return <div className="admin-overview">
    <div className="page-head"><div><h2 className="page-title">Tổng quan hệ thống</h2>
      <p className="subtitle">Các chỉ số chính và công việc cần chú ý từ dữ liệu vận hành hiện tại.</p></div></div>
    <div className="admin-metrics">
      {overview.scope === "OVERVIEW" && <>
        <div className="card card-pad"><span className="hero-label">TỔNG NGƯỜI DÙNG</span><div className="kpi-value">{number(overview.totalUsers)}</div><p className="section-subtitle">+{number(overview.newUsers30d)} trong 30 ngày</p></div>
        <div className="card card-pad"><span className="hero-label">PREMIUM CÒN HẠN</span><div className="kpi-value">{number(overview.premiumUsers)}</div><p className="section-subtitle">{number(overview.liteUsers)} tài khoản Lite</p></div>
      </>}
      <div className="card card-pad"><span className="hero-label">ĐƠN CHỜ THANH TOÁN</span><div className="kpi-value">{number(overview.pendingOrders)}</div><p className="section-subtitle">Trong {number(overview.totalOrders)} đơn</p></div>
      <div className="card card-pad"><span className="hero-label">THU PHÍ ĐÃ PHÂN BỔ</span><div className="kpi-value">{money(overview.collectedVnd)}</div><p className="section-subtitle">{number(overview.paidOrders)} đơn đã thanh toán</p></div>
    </div>
    <div className="admin-task-layout">
      <section className="card admin-task-panel" aria-labelledby="admin-task-title">
        <div className="admin-task-heading"><h3 id="admin-task-title">Công việc ưu tiên</h3><span>Chọn mục để mở khu vực xử lý</span></div>
        {isManager && <TaskRow icon={UsersRound} href="/admin/subscriptions"
          title="Xét duyệt yêu cầu Premium" description="Kiểm tra hồ sơ và quyết định cấp quyền theo quy trình." />}
        {canBill && <TaskRow icon={CreditCard} href="/admin/billing/payments?review=1"
          title="Đối soát giao dịch ngoại lệ" description="Rà soát giao dịch chưa khớp hoặc đang chờ xử lý." />}
        {canBill && <TaskRow icon={BellRing} href="/admin/billing/operations"
          title="Theo dõi cảnh báo vận hành" description="Kiểm tra tín hiệu bất thường từ thu phí và hàng xử lý." />}
        {actor.role === "ANALYST" && <TaskRow icon={UsersRound} href="/admin/analytics"
          title="Phân tích lượt truy cập" description="Xem biến động người dùng hoạt động theo thời gian." />}
      </section>
      <aside className="card admin-context-panel" aria-label="Thông tin khu vực quản trị">
        <span className="admin-task-mark"><ShieldCheck size={18} aria-hidden="true" /></span>
        <h3>Quản trị tập trung</h3>
        <p>Các số liệu phản ánh trạng thái hệ thống tại thời điểm tải trang. Mỗi vai trò chỉ thấy khu vực được cấp quyền.</p>
        <p>Thông tin thanh toán chỉ gồm dữ liệu vận hành và giá trị tổng hợp, không hiển thị số dư hay giao dịch cá nhân.</p>
        {isManager ? <Link href="/admin/users">Tra cứu tài khoản →</Link> :
          canBill ? <Link href="/admin/billing/orders">Xem đơn thu phí →</Link> :
          <Link href="/admin/analytics">Xem báo cáo sử dụng →</Link>}
      </aside>
    </div>
    <details className="admin-overview-details">
      <summary>Báo cáo và dữ liệu chi tiết</summary>
      <section className="card card-pad" style={{ marginTop: 13 }}>
        <p className="subtitle">Các thông tin chuyên sâu chỉ mở khi cần theo dõi hoặc xuất báo cáo.</p>
        {canBill && <p style={{ marginTop: 15 }}>
          <a className="text-link" href="/api/v1/admin/analytics/export?kind=billing&format=csv&days=30">CSV 30 ngày</a>
          {" · "}
          <a className="text-link" href="/api/v1/admin/analytics/export?kind=billing&format=xlsx&days=30">Excel 30 ngày</a>
        </p>}
        {overview.scope === "OVERVIEW" && (overview.traffic.status === "ACTIVE" ? <>
          <p className="subtitle" style={{ marginTop: 15 }}>DAU theo ngày Việt Nam; MAU là số người dùng duy nhất trong 30 ngày. Không theo dõi truy vấn, giao dịch hoặc IP.</p>
          <div className="admin-metrics" style={{ marginTop: 17 }}>
            <div className="card card-pad"><span className="hero-label">DAU · HÔM NAY</span><div className="kpi-value">{number(overview.traffic.dau)}</div></div>
            <div className="card card-pad"><span className="hero-label">WAU · 7 NGÀY</span><div className="kpi-value">{number(overview.traffic.wau)}</div></div>
            <div className="card card-pad"><span className="hero-label">MAU · 30 NGÀY</span><div className="kpi-value">{number(overview.traffic.mau)}</div></div>
            <div className="card card-pad"><span className="hero-label">LƯỢT XEM · 30 NGÀY</span><div className="kpi-value">{number(overview.traffic.pageViews30d)}</div></div>
          </div>
          <p style={{ marginTop: 16 }}><Link className="text-link" href="/admin/analytics">Mở phân tích truy cập</Link></p>
          <div className="table-wrap" style={{ marginTop: 14 }}><table><thead><tr><th>Ngày</th><th>Người dùng hoạt động</th><th>Lượt xem trang</th></tr></thead><tbody>
            {overview.traffic.days.map(day => <tr key={day.day}><td>{day.day}</td><td>{number(day.activeUsers)}</td><td>{number(day.pageViews)}</td></tr>)}
          </tbody></table></div>
        </> : <p className="subtitle" style={{ marginTop: 15 }}>Đo lường truy cập chưa được bật do chờ chính sách quyền riêng tư và cấu hình ghi nhận sự kiện.</p>)}
      </section>
    </details>
  </div>;
}
