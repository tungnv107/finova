import Link from "next/link";
import { listBillingOrdersForOperations, parseBillingOrderFilter } from "@/modules/admin/billing-investigation";
import { requireAdminPageRole } from "@/server/admin-page";

export const dynamic = "force-dynamic";
const time = (value: Date | null) => value ? new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh",
}).format(value) : "—";

export default async function BillingOrdersPage({ searchParams }: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  await requireAdminPageRole(["SUPER_ADMIN", "ADMIN", "FINANCE_OPERATOR"]);
  const params = await searchParams;
  const parsed = Number(params.page ?? "0");
  const page = Number.isSafeInteger(parsed) ? Math.max(0, Math.min(1000, parsed)) : 0;
  const status = parseBillingOrderFilter(params.status);
  let result: Awaited<ReturnType<typeof listBillingOrdersForOperations>>;
  try { result = await listBillingOrdersForOperations({ page, status }); }
  catch {
    return <section className="card card-pad" role="alert">
      <h2 className="section-title">Không tải được danh sách đơn thu phí</h2>
      <p className="subtitle">Dữ liệu tạm thời không khả dụng. Vui lòng thử tải lại trang.</p>
    </section>;
  }
  const href = (target: number) => `/admin/billing/orders?${status ? `status=${status}&` : ""}page=${target}`;
  const formatMoney = (n: string) => `${new Intl.NumberFormat("vi-VN").format(BigInt(n))} VNĐ`;
  return <div>
    <div className="page-head"><div><h2 className="page-title">Đơn thu phí Premium</h2>
      <p className="subtitle">Theo dõi đơn, thời hạn và trạng thái kích hoạt. Không hiển thị tài khoản hoặc số dư của người dùng.</p>
    </div></div>
    <form method="GET" className="admin-order-filter" aria-label="Lọc trạng thái đơn">
      <label htmlFor="admin-order-status">Trạng thái đơn</label>
      <select id="admin-order-status" name="status" defaultValue={status ?? ""}>
        <option value="">Tất cả</option>
        <option value="PENDING_PAYMENT">Chờ thanh toán</option>
        <option value="PAID">Đã thanh toán</option>
        <option value="EXPIRED">Hết hạn</option>
        <option value="REVIEW">Cần kiểm tra</option>
        <option value="REFUNDED">Đã hoàn tiền</option>
      </select>
      <button className="button button-primary" type="submit">Áp dụng</button>
    </form>
    <section className="card card-pad" style={{ marginTop: 18 }}>
      <p className="section-subtitle">{result.total.toLocaleString("vi-VN")} đơn trong bộ lọc</p>
      <div className="table-wrap" role="region" aria-label="Danh sách đơn thu phí" tabIndex={0}>
        <table><thead><tr><th>Mã đơn</th><th>Ngày tạo VN</th><th>Gói</th><th>Số tiền</th>
          <th>Ngân hàng nhận (ẩn)</th><th>Trạng thái</th><th>Hết hạn</th><th>Đã nhận</th><th>Đã kích hoạt</th>
        </tr></thead><tbody>
          {result.orders.map(order => <tr key={order.id}><td>{order.orderCode}</td>
            <td>{time(order.createdAt)}</td><td>{order.billingPeriodSnapshot}</td>
            <td>{formatMoney(order.amountDueVnd)}</td><td>{order.receiver}</td><td>{order.status}</td>
            <td>{time(order.expiresAt)}</td><td>{time(order.paidAt)}</td><td>{time(order.activatedAt)}</td>
          </tr>)}
        </tbody></table>
      </div>
      {result.orders.length === 0 && <p role="status" className="subtitle">Không có đơn thuộc bộ lọc.</p>}
      <div className="admin-pagination">
        {page > 0 && <Link className="button button-outline" href={href(page - 1)}>Trang trước</Link>}
        <span className="section-subtitle">Trang {page + 1}</span>
        {(page + 1) * result.pageSize < result.total && <Link className="button button-outline" href={href(page + 1)}>Trang tiếp</Link>}
      </div>
    </section>
  </div>;
}
