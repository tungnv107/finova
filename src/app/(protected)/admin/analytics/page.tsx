import Link from "next/link";
import { requireAdminPageRole } from "@/server/admin-page";
import { getUsageKpis, usageAnalyticsEnabled } from "@/modules/admin/usage";
import { getRegistrationCohorts } from "@/modules/admin/cohorts";

export const dynamic = "force-dynamic";
const permittedRoles = ["SUPER_ADMIN", "ADMIN", "ANALYST"] as const;
const format = (value: number) => new Intl.NumberFormat("vi-VN").format(value);

export default async function AdminAnalyticsPage({ searchParams }: {
  searchParams: Promise<{ days?: string }>;
}) {
  await requireAdminPageRole(permittedRoles);
  const { days: requestedDays } = await searchParams;
  const days = requestedDays === "90" ? 90 : requestedDays === "30" ? 30 : 7;
  if (!usageAnalyticsEnabled()) return <section className="card card-pad" role="status">
    <h2 className="section-title">Thống kê truy cập</h2>
    <p className="subtitle">Hệ thống chưa bật đo lường hoạt động. Cần nghiệm thu chính sách quyền riêng tư trước khi thu thập dữ liệu.</p>
  </section>;

  let metrics: Awaited<ReturnType<typeof getUsageKpis>>;
  let cohortMetrics: Awaited<ReturnType<typeof getRegistrationCohorts>>;
  try { [metrics, cohortMetrics] = await Promise.all([getUsageKpis(), getRegistrationCohorts()]); }
  catch {
    return <section className="card card-pad" role="alert"><h2 className="section-title">Chưa tải được thống kê truy cập</h2>
      <p className="subtitle">Không thể đọc số liệu trong lúc này. Vui lòng thử tải lại trang.</p></section>;
  }
  const series = metrics.trends.slice(-days);
  const max = Math.max(1, ...series.map(day => day.pageViews));
  const total = days === 90 ? metrics.pageViews90d : days === 30 ? metrics.pageViews30d : metrics.pageViews7d;
  const retention = (value: { rate: number | null }) => value.rate === null ? "—" : `${(value.rate * 100).toFixed(1)}%`;
  const activeCohorts = cohortMetrics.cohorts.slice(-14).reverse();
  return <div>
    <div className="page-head"><div><h2 className="page-title">Thống kê truy cập</h2>
      <p className="subtitle">Hoạt động của người dùng đã đăng nhập, theo ngày Việt Nam (UTC+07). Không thu URL, IP hay dữ liệu tài chính.</p></div></div>
    <div className="admin-metrics">
      <div className="card card-pad"><span className="hero-label">TÀI KHOẢN ĐÃ ĐĂNG KÝ</span><div className="kpi-value">{format(cohortMetrics.totalUsers)}</div></div>
      <div className="card card-pad"><span className="hero-label">ĐĂNG KÝ · 30 NGÀY</span><div className="kpi-value">{format(cohortMetrics.newUsers30d)}</div></div>
      <div className="card card-pad"><span className="hero-label">DAU · HÔM NAY</span><div className="kpi-value">{format(metrics.dau)}</div></div>
      <div className="card card-pad"><span className="hero-label">WAU · 7 NGÀY</span><div className="kpi-value">{format(metrics.wau)}</div></div>
      <div className="card card-pad"><span className="hero-label">MAU · 30 NGÀY</span><div className="kpi-value">{format(metrics.mau)}</div></div>
      <div className="card card-pad"><span className="hero-label">LƯỢT XEM TRANG · {days} NGÀY</span><div className="kpi-value">{format(total)}</div></div>
    </div>
    <section className="card card-pad" style={{ marginTop: 20 }}>
      <div className="page-head"><div><h3 className="section-title">Lượt xem trang theo ngày</h3>
        <p className="subtitle">Số lượt điều hướng hợp lệ; cùng một người có thể xem nhiều trang trong ngày.</p></div>
        <nav className="admin-period-links" aria-label="Chọn khoảng thời gian">
          {([7, 30, 90] as const).map(period => <Link key={period} href={`/admin/analytics?days=${period}`}
            aria-current={period === days ? "page" : undefined} className={`button ${period === days ? "button-primary" : "button-outline"}`}>{period} ngày</Link>)}
        </nav></div>
      <nav className="admin-period-links" aria-label="Xuất thống kê truy cập" style={{ marginBottom: 16 }}>
        <a className="button button-outline" href={`/api/v1/admin/analytics/export?kind=traffic&format=csv&days=${days}`}>Tải CSV {days} ngày</a>
        <a className="button button-outline" href={`/api/v1/admin/analytics/export?kind=traffic&format=xlsx&days=${days}`}>Tải Excel {days} ngày</a>
      </nav>
      {total === 0 ? <p className="subtitle" role="status">Chưa ghi nhận lượt xem trang trong khoảng thời gian này.</p> :
        <div className="admin-traffic-chart" role="img" aria-label={`Biểu đồ lượt xem trang ${days} ngày, tổng ${format(total)} lượt`}>
          {series.map(day => <div key={day.day} className="admin-traffic-bar"
            title={`${day.day}: ${format(day.pageViews)} lượt, ${format(day.activeUsers)} người`}
            style={{ height: `${day.pageViews / max * 100}%` }} />)}
        </div>}
      <details style={{ marginTop: 20 }}><summary>Xem dữ liệu từng ngày</summary>
        <div className="table-wrap" role="region" aria-label="Chi tiết lượt xem trang theo ngày" tabIndex={0}><table><thead><tr><th>Ngày</th><th>Người dùng hoạt động</th><th>Lượt xem trang</th></tr></thead>
          <tbody>{series.slice().reverse().map(day => <tr key={day.day}><td>{day.day}</td><td>{format(day.activeUsers)}</td><td>{format(day.pageViews)}</td></tr>)}</tbody>
        </table></div></details>
      <p className="section-subtitle" style={{ marginTop: 16 }}>
        DAU = người dùng riêng biệt hôm nay; WAU/MAU = người dùng riêng biệt trong 7/30 ngày gần nhất.
        Các khoảng thời gian tính theo ngày lịch Việt Nam. Số liệu chỉ có từ khi bật thu thập; chưa bao gồm khách truy cập ẩn danh hoặc session.
      </p>
    </section>
    <section className="card card-pad" style={{ marginTop: 20 }}>
      <h3 className="section-title">Cohort và tỷ lệ quay lại</h3>
      <p className="section-subtitle">Nhóm theo ngày đăng ký (giờ Việt Nam). D1/D7/D30 là tỷ lệ có hoạt động đúng ngày thứ 1/7/30 sau đăng ký; nhóm chưa đủ tuổi được loại khỏi mẫu số.</p>
      <div className="admin-metrics" aria-label="Tỷ lệ người dùng quay lại">
        <div><span className="hero-label">D1 · {format(cohortMetrics.day1.returned)}/{format(cohortMetrics.day1.users)}</span><div className="kpi-value">{retention(cohortMetrics.day1)}</div></div>
        <div><span className="hero-label">D7 · {format(cohortMetrics.day7.returned)}/{format(cohortMetrics.day7.users)}</span><div className="kpi-value">{retention(cohortMetrics.day7)}</div></div>
        <div><span className="hero-label">D30 · {format(cohortMetrics.day30.returned)}/{format(cohortMetrics.day30.users)}</span><div className="kpi-value">{retention(cohortMetrics.day30)}</div></div>
      </div>
      <details style={{ marginTop: 16 }}><summary>Chi tiết cohort đăng ký 14 ngày gần nhất</summary>
        <div className="table-wrap" role="region" aria-label="Chi tiết nhóm đăng ký và quay lại" tabIndex={0}><table><thead><tr><th>Ngày đăng ký (VN)</th><th>Đăng ký</th><th>Hoạt động D0</th><th>Quay lại D1</th><th>D7</th><th>D30</th></tr></thead>
          <tbody>{activeCohorts.map(day => <tr key={day.day}><td>{day.day}</td><td>{format(day.signups)}</td>
            <td>{format(day.activeD0)}</td><td>{day.activeD1 === null ? "—" : format(day.activeD1)}</td>
            <td>{day.activeD7 === null ? "—" : format(day.activeD7)}</td>
            <td>{day.activeD30 === null ? "—" : format(day.activeD30)}</td></tr>)}</tbody>
        </table></div></details>
      <p className="section-subtitle">Tỷ lệ phản ánh lượt xem trang đã được ghi nhận khi có consent và bật đo lường. Trước thời điểm bật tính năng, người dùng có thể hoạt động mà chưa có dữ liệu thống kê; bộ lọc bot/nội bộ còn theo AD5-01/02.</p>
    </section>
  </div>;
}
