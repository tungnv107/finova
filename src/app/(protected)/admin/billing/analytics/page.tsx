import Link from "next/link";
import { getBillingAnalytics } from "@/modules/admin/billing-analytics";
import { requireAdminPageRole } from "@/server/admin-page";

export const dynamic = "force-dynamic";
const number = (n: number) => new Intl.NumberFormat("vi-VN").format(n);
const money = (n: string) => `${new Intl.NumberFormat("vi-VN").format(BigInt(n))} VNĐ`;

export default async function BillingAnalyticsPage({ searchParams }: {
  searchParams: Promise<{ days?: string }>;
}) {
  await requireAdminPageRole(["SUPER_ADMIN", "ADMIN", "FINANCE_OPERATOR"]);
  const params = await searchParams;
  const days = params.days === "90" ? 90 : params.days === "30" ? 30 : 7;
  let report: Awaited<ReturnType<typeof getBillingAnalytics>>;
  try { report = await getBillingAnalytics(days); }
  catch {
    return <section role="alert" className="card card-pad">
      <h2 className="section-title">Không tải được phân tích thu phí</h2>
      <p className="subtitle">Dữ liệu thu phí đang tạm thời không khả dụng. Vui lòng tải lại trang.</p>
    </section>;
  }
  const { totals: t, rows } = report;
  const active = rows.filter(row => row.orders || row.paidGrants || row.allocatedCount || row.exceptions || row.expiredUsers);
  const max = Math.max(1, ...rows.map(row => row.orders));
  const cards = [
    { title: "ĐƠN TẠO TRONG KỲ", value: number(t.orders), explanation: `Tháng: ${number(t.monthlyOrders)} · Năm: ${number(t.yearlyOrders)}` },
    { title: "PHỄU ĐƠN TẠO → ĐÃ TRẢ → CẤP QUYỀN", value: `${number(t.orders)} → ${number(t.paidFromOrders)} → ${number(t.activatedFromOrders)}`,
      explanation: `Tỷ lệ đã trả: ${t.createdToPaidRate === null ? "—" : `${(t.createdToPaidRate * 100).toFixed(1)}%`} · cấp quyền: ${t.createdToActivatedRate === null ? "—" : `${(t.createdToActivatedRate * 100).toFixed(1)}%`}. Cùng nhóm đơn tạo trong kỳ; đã trả tính từ paidAt, kể cả đơn sau đó hoàn tiền.` },
    { title: "CẤP QUYỀN TỪ THANH TOÁN", value: number(t.paidGrants), explanation: `Trong đó gia hạn từ thanh toán trước: ${number(t.renewals)}.` },
    { title: "NGƯỜI ĐƯỢC CẤP PREMIUM TRẢ PHÍ", value: number(t.paidUsers),
      explanation: `Đếm duy nhất trong kỳ: lần đầu ${number(t.firstPaidUsers)}, có gia hạn ${number(t.renewingUsers)}. Một người có thể thuộc cả hai nhóm. Grant tháng/năm: ${number(t.monthlyGrants)}/${number(t.yearlyGrants)}.` },
    { title: "HẾT HẠN KHÔNG CÓ GIA HẠN", value: number(t.expiredUsers), explanation: "Số người hết hạn trong kỳ, không có grant khác nối tiếp tại thời điểm hết hạn." },
    { title: "TIỀN PHÂN BỔ (GROSS)", value: money(t.grossVnd), explanation: `${number(t.allocatedCount)} phân bổ; chưa trừ hoàn tiền, không phải doanh thu thuần.` },
    { title: "GIAO DỊCH NGOẠI LỆ", value: number(t.exceptions), explanation: `Sự kiện đã xác minh: ${number(t.verifiedEvents)}; chưa khớp tại thời điểm xem: ${number(t.unresolvedEvents)}.` },
    { title: "GIÁ TRỊ ĐẦU VÀO CHỜ ĐỐI SOÁT", value: money(t.reviewIncomingVnd),
      explanation: `${number(t.reviewIncomingCount)} giao dịch chiều IN đã xác minh nhưng chưa khớp, theo ngày nhận sự kiện. Đây không phải khoản thu đã phân bổ.` },
    { title: "ĐƠN GẮN NHÃN HOÀN TIỀN", value: number(t.refundedOrderCohort), explanation: "Trạng thái hiện tại của đơn tạo trong kỳ; chưa có ngày/giá trị tiền hoàn thực tế." },
  ];
  return <div>
    <div className="page-head"><div>
      <h2 className="page-title">Phân tích thu phí Premium</h2>
      <p className="subtitle">Số liệu tổng hợp theo ngày Việt Nam · {report.fromVn} đến {report.untilVn}. Không hiển thị người dùng, giao dịch ngân hàng hoặc mã đơn.</p>
    </div></div>
    <nav className="admin-period-links" aria-label="Chọn khoảng thời gian thu phí">
      {([7, 30, 90] as const).map(period => <Link className={`button ${period === days ? "button-primary" : "button-outline"}`}
        href={`/admin/billing/analytics?days=${period}`} aria-current={period === days ? "page" : undefined} key={period}>
        {period} ngày</Link>)}
    </nav>
    <div className="admin-metrics" style={{ marginTop: 16 }}>
      {cards.map(card => <div className="card card-pad" key={card.title}>
        <span className="hero-label">{card.title}</span><div className="kpi-value">{card.value}</div>
        <p className="section-subtitle">{card.explanation}</p>
      </div>)}
    </div>
    <section className="card card-pad" style={{ marginTop: 20 }}>
      <h3 className="section-title">Đơn tạo mới theo ngày</h3>
      {t.orders === 0 ? <p role="status" className="subtitle">Chưa có đơn được tạo trong khoảng thời gian đã chọn.</p> :
        <div className="admin-traffic-chart" role="img" aria-label={`Biểu đồ ${days} ngày, tổng ${number(t.orders)} đơn`}>
          {rows.map(row => <div key={row.day} className="admin-traffic-bar" title={`${row.day}: ${number(row.orders)} đơn`}
            style={{ height: `${row.orders / max * 100}%` }} />)}
        </div>}
      <details style={{ marginTop: 20 }}><summary>Xem chi tiết theo ngày ({days} ngày, bao gồm ngày không phát sinh)</summary>
        <div className="table-wrap" role="region" aria-label="Chi tiết thống kê thu phí theo ngày" tabIndex={0}><table><thead><tr>
          <th>Ngày VN</th><th>Đơn tạo</th><th>Đã trả từ nhóm đơn tạo</th><th>Đơn đã cấp quyền</th><th>Grant thu phí</th><th>Gia hạn</th>
          <th>Hết hạn</th><th>Phân bổ gross</th><th>Chờ đối soát IN</th><th>Ngoại lệ</th>
        </tr></thead><tbody>
          {rows.slice().reverse().map(row => <tr key={row.day}>
            <td>{row.day}</td><td>{number(row.orders)}</td><td>{number(row.paidFromOrders)}</td><td>{number(row.activatedFromOrders)}</td>
            <td>{number(row.paidGrants)}</td><td>{number(row.renewals)}</td><td>{number(row.expiredUsers)}</td>
            <td>{money(row.grossVnd)}</td><td>{money(row.reviewIncomingVnd)}</td><td>{number(row.exceptions)}</td>
          </tr>)}
        </tbody></table></div>
      </details>
      <p className="section-subtitle" style={{ marginTop: 12 }}>
        Có hoạt động trong {number(active.length)}/{days} ngày. Mốc ngày của từng chỉ số lần lượt là thời điểm tạo đơn,
        tạo grant, phân bổ và nhận giao dịch. Trạng thái đơn và ngoại lệ có thể thay đổi khi tiếp tục đối soát.
        Số liệu không bao gồm dòng tiền hoàn thực tế, chênh lệch thuế hoặc doanh thu thuần.
      </p>
      <div className="admin-shortcuts">
        <Link href="/admin/billing/payments?review=1" className="button button-outline">Kiểm tra hàng ngoại lệ</Link>
        <a className="button button-outline" href={`/api/v1/admin/analytics/export?kind=billing&format=csv&days=${days}`}>Tải tổng hợp CSV</a>
      </div>
    </section>
  </div>;
}
