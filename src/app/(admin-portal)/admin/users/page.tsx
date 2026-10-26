import Link from "next/link";
import { listAdminUsers } from "@/modules/admin/users";
import { requireAdminPageRole } from "@/server/admin-page";
import { userManagementRoles } from "@/server/system-auth";
import type { UserAccessStatus } from "@finova/prisma";

export const dynamic = "force-dynamic";
const vnDate = (date: Date) => new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short" }).format(date);

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string; cursor?: string; status?: string }> }) {
  const actor = await requireAdminPageRole(userManagementRoles);
  const p = await searchParams;
  const status: UserAccessStatus | undefined = p.status === "ACTIVE" || p.status === "SUSPENDED" || p.status === "DEACTIVATED" ? p.status : undefined;
  const result = await listAdminUsers({ q: p.q, cursor: p.cursor, status });
  const linkFor = (cursor: string) => `/admin/users?${new URLSearchParams({ q: p.q ?? "", status: status ?? "", cursor })}`;
  const exportLink = `/api/v1/admin/users/export?${new URLSearchParams({ q: p.q ?? "", status: status ?? "" })}`;
  return <div>
    <div className="page-head"><div><h2 className="page-title">Người dùng</h2><p className="subtitle">{result.total} tài khoản khớp bộ lọc. Chỉ hiển thị hồ sơ và gói, không truy cập dữ liệu tài chính cá nhân.</p></div>
      {actor.role === "SUPER_ADMIN" && <a className="button button-outline" href={exportLink}>Xuất CSV (tối đa 500)</a>}</div>
    <form method="GET" className="card filterbar" aria-label="Bộ lọc người dùng">
      <div className="field"><label htmlFor="user-q">Tên hoặc email</label><input id="user-q" name="q" defaultValue={p.q ?? ""} maxLength={100} placeholder="Tìm người dùng" /></div>
      <div className="field"><label htmlFor="user-status">Trạng thái</label><select id="user-status" name="status" defaultValue={status ?? ""}>
        <option value="">Tất cả</option><option value="ACTIVE">Hoạt động</option><option value="SUSPENDED">Tạm khóa</option><option value="DEACTIVATED">Ngừng hoạt động</option>
      </select></div><button className="button button-primary" type="submit">Lọc</button>
    </form>
    <div className="card table-wrap"><table><thead><tr><th>Tài khoản</th><th>Ngày tạo</th><th>Trạng thái</th><th>Gói thực tế</th><th>Thao tác</th></tr></thead>
      <tbody>{result.users.map(user => <tr key={user.id}>
        <td><strong>{user.name}</strong><div className="section-subtitle">{user.email}</div></td>
        <td>{vnDate(user.createdAt)}</td><td><span className="admin-pill">{user.accessState}</span></td>
        <td>{user.plan}{user.premiumExpiresAt && <div className="section-subtitle">Đến {vnDate(user.premiumExpiresAt)}</div>}</td>
        <td><Link className="text-link" href={`/admin/users/${user.id}`}>Chi tiết</Link></td>
      </tr>)}</tbody></table>
      {!result.users.length && <div className="empty">Không có người dùng phù hợp.</div>}
    </div>
    <div className="admin-pagination"><span>Hiển thị {result.users.length} / {result.total} tài khoản khớp bộ lọc</span><div>
      {result.previousCursor && <Link className="button button-outline" href={linkFor(result.previousCursor)}>Trang trước</Link>}
      {result.nextCursor && <Link className="button button-outline" href={linkFor(result.nextCursor)}>Trang sau</Link>}
    </div></div>
  </div>;
}
