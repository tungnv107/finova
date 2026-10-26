import Link from "next/link";
import { getOperatorBillingIncidents } from "@/modules/admin/billing-operational-monitor";
import { AdminOperationalAck } from "@/components/admin-operational-ack";
import { requireAdminPageRole } from "@/server/admin-page";

export const dynamic = "force-dynamic";

export default async function BillingOperationalInbox() {
  const actor = await requireAdminPageRole(["SUPER_ADMIN", "ADMIN", "FINANCE_OPERATOR"]);
  let incidents: Awaited<ReturnType<typeof getOperatorBillingIncidents>>;
  try { incidents = await getOperatorBillingIncidents(actor); }
  catch {
    return <section className="card card-pad" role="alert">Không tải được hộp cảnh báo. Kiểm tra kết nối dữ liệu.</section>;
  }
  return <div>
    <div className="page-head"><div>
      <h2 className="page-title">Hộp cảnh báo đã phân công</h2>
      <p className="subtitle">Các sự cố được scheduler ghi nhận và gửi đến tài khoản vận hành có quyền.
        Xác nhận đã nhận được ghi vào nhật ký; sự cố chỉ đóng khi tín hiệu không còn vượt ngưỡng.</p>
    </div></div>
    <div className="admin-shortcuts">
      <Link className="button button-outline" href="/admin/billing/operations">Tín hiệu hiện tại</Link>
      <Link className="button button-outline" href="/admin/billing/operations/inbox">Tải lại</Link>
    </div>
    {incidents.length === 0 ? <section className="card card-pad" role="status" style={{ marginTop: 18 }}>
      <p>Chưa có cảnh báo được phân công. Kiểm tra cài đặt scheduler nếu dự kiến có sự cố.</p>
    </section> : <div className="admin-metrics" style={{ marginTop: 18 }}>
      {incidents.map(incident => <section className="card card-pad" key={incident.id}>
        <span className="hero-label">{incident.severity.toUpperCase()} · {incident.code} · {incident.state}</span>
        <h3 className="section-title" style={{ marginTop: 8 }}>{incident.title}</h3>
        <div className="kpi-value">{incident.count.toLocaleString("vi-VN")}</div>
        <p className="section-subtitle">{incident.explanation}</p>
        <p className="section-subtitle">Mở: {incident.openedAt.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}
          {incident.escalatedAt ? " · Đã chuyển cấp" : ""}</p>
        <Link className="button button-outline" href={incident.href}>Xem dữ liệu</Link>
        {incident.state === "OPEN" && <AdminOperationalAck id={incident.id}/>}
      </section>)}
    </div>}
  </div>;
}
