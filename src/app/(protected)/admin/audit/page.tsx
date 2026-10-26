import Link from "next/link";
import { listSensitiveAdminAudit, parseSensitiveAuditAction } from "@/modules/admin/billing-investigation";
import { requireAdminPageRole } from "@/server/admin-page";

export const dynamic = "force-dynamic";

export default async function AdminAuditPage({ searchParams }: {
  searchParams: Promise<{ page?: string; action?: string }>;
}) {
  await requireAdminPageRole(["SUPER_ADMIN", "ADMIN"]);
  const params = await searchParams;
  const parsed = Number(params.page ?? "0");
  const page = Number.isSafeInteger(parsed) ? Math.max(0, Math.min(1000, parsed)) : 0;
  const action = parseSensitiveAuditAction(params.action);
  let result: Awaited<ReturnType<typeof listSensitiveAdminAudit>>;
  try { result = await listSensitiveAdminAudit({ page, action }); }
  catch {
    return <section className="card card-pad" role="alert">
      <h2 className="section-title">Không tải được nhật ký quản trị</h2>
      <p className="subtitle">Dữ liệu tạm thời không khả dụng. Vui lòng thử tải lại trang.</p>
    </section>;
  }
  const href = (target: number) => `/admin/audit?${action ? `action=${action}&` : ""}page=${target}`;
  return <div>
    <div className="page-head"><div><h2 className="page-title">Nhật ký thay đổi nhạy cảm</h2>
      <p className="subtitle">Chỉ xem các loại thao tác quản trị có ảnh hưởng quyền truy cập hoặc thu phí. Nội dung lý do, dữ liệu trước/sau và định danh cá nhân được ẩn.</p>
    </div></div>
    <nav aria-label="Lọc nhật ký" className="admin-shortcuts">
      <Link className="button button-outline" href="/admin/audit">Tất cả</Link>
      <Link className="button button-outline" href="/admin/audit?action=RECEIVER_APPROVE">Tài khoản nhận phí</Link>
      <Link className="button button-outline" href="/admin/audit?action=USER_ACCESS_CHANGE">Truy cập người dùng</Link>
      <Link className="button button-outline" href="/admin/audit?action=PRICE_PUBLISH">Công bố giá</Link>
    </nav>
    <section className="card card-pad" style={{ marginTop: 18 }}>
      <p className="section-subtitle">{result.total.toLocaleString("vi-VN")} sự kiện trong bộ lọc</p>
      <div className="table-wrap" role="region" aria-label="Nhật ký quản trị" tabIndex={0}>
        <table><thead><tr><th>Thời điểm VN</th><th>Thao tác</th><th>Đối tượng</th></tr></thead><tbody>
          {result.events.map(event => <tr key={event.id}>
            <td>{new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(event.createdAt)}</td>
            <td>{event.action}</td><td>{event.resourceType}</td>
          </tr>)}
        </tbody></table>
      </div>
      {result.events.length === 0 && <p className="subtitle" role="status">Chưa có thao tác trong bộ lọc.</p>}
      <div className="admin-pagination">
        {page > 0 && <Link className="button button-outline" href={href(page - 1)}>Trang trước</Link>}
        <span className="section-subtitle">Trang {page + 1}</span>
        {(page + 1) * result.pageSize < result.total && <Link className="button button-outline" href={href(page + 1)}>Trang tiếp</Link>}
      </div>
    </section>
  </div>;
}
