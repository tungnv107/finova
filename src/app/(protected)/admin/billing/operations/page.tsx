import Link from "next/link";
import { getBillingOperationalAlerts } from "@/modules/admin/billing-operational-alerts";
import { requireAdminPageRole } from "@/server/admin-page";

export const dynamic = "force-dynamic";

const priority = { critical: "Khẩn cấp", warning: "Cần kiểm tra", info: "Theo dõi" } as const;

export default async function BillingOperationsPage() {
  // Finance and administrators only: no user/analyst access to payment incident signals.
  await requireAdminPageRole(["SUPER_ADMIN", "ADMIN", "FINANCE_OPERATOR"]);
  let data: Awaited<ReturnType<typeof getBillingOperationalAlerts>>;
  try { data = await getBillingOperationalAlerts(); }
  catch {
    return <section className="card card-pad" role="alert">
      <h2 className="section-title">Không đọc được tín hiệu vận hành</h2>
      <p className="subtitle">Có thể kết nối cơ sở dữ liệu đang gặp sự cố. Kiểm tra hệ thống và thử tải lại.</p>
    </section>;
  }
  return <div>
    <div className="page-head"><div>
      <h2 className="page-title">Cảnh báo vận hành thu phí</h2>
      <p className="subtitle">Tín hiệu từ dữ liệu thanh toán, worker và nhật ký hệ thống lúc {new Intl.DateTimeFormat("vi-VN", {
        dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh",
      }).format(data.checkedAt)}. Chỉ hiển thị số lượng tổng hợp.</p>
    </div></div>
    <div className="admin-shortcuts">
      <Link href="/admin/billing/operations/inbox" className="button button-outline">Hộp cảnh báo đã phân công</Link>
      <Link href="/admin/billing/operations" className="button button-outline">Kiểm tra lại</Link>
      <Link href="/admin/billing/payments?review=1" className="button button-outline">Hàng đối soát</Link>
      <Link href="/admin/billing/notices" className="button button-outline">Hàng thông báo</Link>
    </div>
    {data.alerts.length === 0 ? <section className="card card-pad" role="status" style={{ marginTop: 18 }}>
      <h3 className="section-title">Chưa thấy tín hiệu vượt ngưỡng</h3>
      <p className="subtitle">Đây là ảnh chụp dữ liệu tại thời điểm tải trang; chưa có giám sát heartbeat provider hay kênh đẩy cảnh báo liên tục.</p>
    </section> : <div className="admin-metrics" style={{ marginTop: 18 }}>
      {data.alerts.map(alert => <section key={alert.code} className="card card-pad" aria-label={alert.title}>
        <span className="hero-label">{priority[alert.severity]} · {alert.code}</span>
        <h3 className="section-title" style={{ marginTop: 8 }}>{alert.title}</h3>
        <div className="kpi-value">{alert.count.toLocaleString("vi-VN")}</div>
        <p className="section-subtitle">{alert.explanation}</p>
        <Link className="button button-outline" href={alert.href}>Xem và xử lý</Link>
      </section>)}
    </div>}
    <p className="section-subtitle" style={{ marginTop: 18 }}>
      Các ngưỡng DEV: 15 phút cho hàng xử lý và ngoại lệ, 10 phút quá hạn đơn,
      2 giờ không có tín hiệu nhận tiền khi có đơn chờ, 5 thao tác cùng loại trong 15 phút.
      Không tự cấp quyền, hoàn tiền hay replay từ cảnh báo. Quyết định xử lý theo quy trình hai người và chứng từ độc lập.
    </p>
  </div>;
}
