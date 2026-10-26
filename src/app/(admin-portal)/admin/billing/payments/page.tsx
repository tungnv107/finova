import Link from "next/link";
import { listAdminPayments } from "@/modules/admin/payments";
import { requireAdminPageRole } from "@/server/admin-page";

export const dynamic = "force-dynamic";
const money = (amount: number) => `${new Intl.NumberFormat("vi-VN").format(amount)} VNĐ`;
const time = (date: Date) => new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short",
}).format(date);

export default async function AdminPaymentsPage({ searchParams }: {
  searchParams: Promise<{ page?: string; review?: string }>;
}) {
  await requireAdminPageRole(["SUPER_ADMIN", "ADMIN", "FINANCE_OPERATOR"]);
  const params = await searchParams;
  const parsedPage = Number(params.page ?? "0");
  const page = Number.isSafeInteger(parsedPage) ? Math.min(1000, Math.max(0, parsedPage)) : 0;
  const reviewOnly = params.review === "1";
  const result = await listAdminPayments({ page, reviewOnly });
  const href = (target: number) => `/admin/billing/payments?${reviewOnly ? "review=1&" : ""}page=${target}`;

  return <div>
    <div className="page-head"><div><h2 className="page-title">Đối soát thanh toán Premium</h2>
      <p className="subtitle">Các giao dịch ngân hàng đã ghi nhận; chỉ giao dịch xác thực và khớp đầy đủ mới cấp Premium.</p></div></div>
    <div className="admin-operations-toolbar">
      <nav aria-label="Chế độ đối soát" className="admin-segmented">
        <Link aria-current={!reviewOnly ? "page" : undefined} href="/admin/billing/payments">Tất cả</Link>
        <Link aria-current={reviewOnly ? "page" : undefined} href="/admin/billing/payments?review=1">Cần kiểm tra</Link>
      </nav>
      <span className="section-subtitle">{result.total} giao dịch {reviewOnly ? "cần kiểm tra" : "đã ghi nhận"}</span>
      <details className="admin-more-actions"><summary>Liên quan</summary><div>
        <Link href="/admin/billing/notices">Hàng lỗi thông báo</Link>
      </div></details>
    </div>
    <section className="card card-pad" style={{ marginTop: 20 }}>
      <div className="table-wrap"><table><thead><tr>
        <th>Thời điểm</th><th>Provider</th><th>Mã giao dịch (ẩn)</th><th>Tiền nhận</th>
        <th>Mã đơn</th><th>Đối soát</th><th>Xác thực</th><th>Worker</th>
      </tr></thead><tbody>
        {result.events.map(item => <tr key={item.id}>
          <td>{time(item.occurredAt)}</td><td>{item.provider}</td><td>{item.transactionMasked}</td>
          <td>{item.direction === "IN" ? "+" : "−"}{money(item.amountVnd)}</td>
          <td>{item.transferReference ?? "Không nhận dạng"}</td>
          <td><span className="admin-pill">{item.matchStatus}</span></td>
          <td>{item.verificationStatus}</td>
          <td>{item.deadLetteredAt ? `DLQ · ${item.attemptCount} lần` : item.leaseUntil && item.leaseUntil > new Date()
            ? "Đang xử lý" : item.matchStatus === "RECEIVED" && item.attemptCount > 0
              ? `Thử lại ${time(item.nextAttemptAt)}` : "—"}</td>
        </tr>)}
      </tbody></table></div>
      {result.events.length === 0 && <p className="section-subtitle">Chưa có giao dịch thuộc bộ lọc.</p>}
      <div className="admin-pagination">
        {page > 0 && <Link className="button button-outline" href={href(page - 1)}>Trang trước</Link>}
        <span className="section-subtitle">Trang {page + 1}</span>
        {(page + 1) * result.pageSize < result.total && <Link className="button button-outline" href={href(page + 1)}>Trang tiếp</Link>}
      </div>
    </section>
    <p className="section-subtitle" style={{ marginTop: 12 }}>Đây là bảng theo dõi chỉ đọc. Giao dịch ngoại lệ phải đối chiếu với chứng từ ngân hàng trước khi điều chỉnh; chưa có thao tác duyệt thủ công hay hoàn tiền.</p>
  </div>;
}
