import Link from "next/link";
import { AdminSubscriptionDecision } from "@/components/admin-subscription-actions";
import { getSubscriptionOperations, listSubscriptionActionPage, listSubscriptionLifecycle } from "@/modules/billing/manual-subscriptions";
import { requireAdminPageRole } from "@/server/admin-page";

export const dynamic = "force-dynamic";
const vietnamTime = (d: Date) => new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short",
}).format(d);

export default async function AdminSubscriptionActionsPage({ searchParams }: {
  searchParams: Promise<{ status?: string; cursor?: string; actionCursor?: string }>;
}) {
  const actor = await requireAdminPageRole(["SUPER_ADMIN", "ADMIN"]);
  const params = await searchParams;
  const raw = params.status;
  const status = raw === "APPROVED" || raw === "REJECTED" ? raw : "PENDING";
  const [actions, summary, timeline] = await Promise.all([
    listSubscriptionActionPage(status, params.actionCursor), getSubscriptionOperations(), listSubscriptionLifecycle(params.cursor),
  ]);
  const n = (value: number) => new Intl.NumberFormat("vi-VN").format(value);
  const eventLabel = (kind: string) => ({ GRANT_ACTIVATED: "Kích hoạt từ thanh toán",
    MANUAL_ACTIVATED: "Duyệt cấp bù", GRANT_REVOKED: "Thu hồi quyền" }[kind] ?? kind);
  return <div>
    <div className="page-head"><div><h2 className="page-title">Yêu cầu Premium</h2>
      <p className="subtitle">Đăng ký từ người dùng và cấp bù/thu hồi nội bộ. Chỉ Super Admin có thể duyệt; mọi quyết định được lưu nhật ký.</p></div></div>
    <div className="admin-metrics" aria-label="Tổng hợp điều chỉnh Premium">
      <div className="card card-pad"><span className="hero-label">CHỜ PHÊ DUYỆT CÒN HẠN</span><div className="kpi-value">{n(summary.pending)}</div></div>
      <div className="card card-pad"><span className="hero-label">ĐÃ DUYỆT · LŨY KẾ</span><div className="kpi-value">{n(summary.approved)}</div></div>
      <div className="card card-pad"><span className="hero-label">ĐÃ TỪ CHỐI · LŨY KẾ</span><div className="kpi-value">{n(summary.rejected)}</div></div>
      <div className="card card-pad"><span className="hero-label">GRANT THỦ CÔNG HIỆU LỰC</span><div className="kpi-value">{n(summary.activeManualGrants)}</div>
        <p className="section-subtitle">Số lượt cấp quyền, không phải số người dùng duy nhất.</p></div>
    </div>
    <nav className="admin-shortcuts" aria-label="Lọc trạng thái đề xuất">
      <Link className="button button-outline" href="/admin/subscriptions">Chờ duyệt</Link>
      <Link className="button button-outline" href="/admin/subscriptions?status=APPROVED">Đã duyệt</Link>
      <Link className="button button-outline" href="/admin/subscriptions?status=REJECTED">Từ chối</Link>
    </nav>
    <section className="card card-pad" style={{ marginTop: 20 }}>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Danh sách yêu cầu Premium"><table><thead><tr><th>Người dùng</th><th>Yêu cầu</th><th>Lý do</th>
        <th>Đề xuất / hạn duyệt</th><th>Người duyệt / kết quả</th></tr></thead><tbody>
        {actions.items.map(a => <tr key={a.id}>
          <td><Link href={`/admin/users/${encodeURIComponent(a.userId)}`}>{a.userId}</Link></td>
          <td>{a.kind === "MANUAL_GRANT" ? `${a.requestedBy === a.userId ? "Đăng ký Premium" : "Cấp bù"} ${a.billingPeriod === "MONTH" ? "1 tháng" : "1 năm"}` : "Thu hồi grant thủ công"}</td>
          <td><p>{a.reason}</p><span className="section-subtitle">{a.requestedBy === a.userId ? "Người dùng tự đăng ký" : `Đề xuất bởi ${a.requestedBy}`}</span></td>
          <td>{vietnamTime(a.createdAt)}<br />{vietnamTime(a.expiresAt)}</td>
          <td>{a.status === "PENDING" ? (a.expiresAt <= new Date() ? "Đề xuất quá hạn" :
            <AdminSubscriptionDecision id={a.id} canReview={actor.role === "SUPER_ADMIN" && actor.userId !== a.requestedBy && actor.userId !== a.userId} />) :
            <><strong>{a.status === "APPROVED" ? "Đã duyệt" : "Từ chối"}</strong><br />
              <span className="section-subtitle">{a.reviewedBy} · {a.reviewedAt ? vietnamTime(a.reviewedAt) : "—"}</span>
              {a.reviewReason && <p>{a.reviewReason}</p>}</>}</td>
        </tr>)}
      </tbody></table></div>
      {!actions.items.length && <p className="section-subtitle">Chưa có đề xuất ở trạng thái này.</p>}
      <p className="section-subtitle">Với đăng ký từ người dùng, chỉ phê duyệt sau khi đã tự xác minh điều kiện và thanh toán qua kênh chính thức. Phê duyệt thủ công không tạo doanh thu, đơn hàng hay xác nhận ngân hàng trong Finova.</p>
      <div className="admin-shortcuts">
        {params.actionCursor && <Link className="button button-outline" href={`/admin/subscriptions?status=${status}${params.cursor ? `&cursor=${encodeURIComponent(params.cursor)}` : ""}`}>Trang đầu đề xuất</Link>}
        {actions.nextCursor && <Link className="button button-outline" href={`/admin/subscriptions?status=${status}&actionCursor=${encodeURIComponent(actions.nextCursor)}${params.cursor ? `&cursor=${encodeURIComponent(params.cursor)}` : ""}`}>Xem 50 đề xuất tiếp</Link>}
      </div>
      <p className="section-subtitle">Thu hồi giao dịch có phí thuộc quy trình hoàn tiền/tranh chấp riêng. Cấp bù không tính doanh thu ngân hàng.</p>
    </section>
    <section className="card card-pad" style={{ marginTop: 20 }}>
      <h3 className="section-title">Lịch sử cấp quyền và gia hạn</h3>
      <p className="section-subtitle">Sự kiện ghi nhận bất biến từ thanh toán đã xác minh hoặc quy trình phê duyệt thủ công. Không bao gồm ví và sao kê cá nhân.</p>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Lịch sử cấp quyền Premium"><table><thead><tr><th>Thời gian (VN)</th><th>Người dùng</th><th>Sự kiện</th><th>Bắt đầu</th><th>Hết hạn</th><th>Nguồn</th></tr></thead><tbody>
        {timeline.items.map(e => <tr key={e.id}><td>{vietnamTime(e.createdAt)}</td>
          <td><Link href={`/admin/users/${encodeURIComponent(e.userId)}`}>{e.userId}</Link></td>
          <td>{eventLabel(e.kind)}</td><td>{e.startsAt ? vietnamTime(e.startsAt) : "—"}</td>
          <td>{e.expiresAt ? vietnamTime(e.expiresAt) : "—"}</td>
          <td>{e.orderId ? "Đơn đã xác minh" : e.actionRequestId ? "Phê duyệt nội bộ" : "Lịch sử chuyển đổi"}</td></tr>)}
      </tbody></table></div>
      {!timeline.items.length && <p className="section-subtitle">Chưa có sự kiện Premium.</p>}
      <div className="admin-shortcuts">
        {params.cursor && <Link className="button button-outline" href={`/admin/subscriptions?status=${status}`}>Trang đầu lịch sử</Link>}
        {timeline.nextCursor && <Link className="button button-outline" href={`/admin/subscriptions?status=${status}&cursor=${encodeURIComponent(timeline.nextCursor)}`}>Xem 50 sự kiện tiếp</Link>}
      </div>
    </section>
  </div>;
}
