import { AdminNavigation } from "@/components/admin-navigation";
import { requireAdminPageRole } from "@/server/admin-page";
import { allReportingRoles } from "@/server/system-auth";
import "@/styles/finova-admin.css";

export const dynamic = "force-dynamic";

const roleNames = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Quản trị viên",
  FINANCE_OPERATOR: "Vận hành thu phí",
  ANALYST: "Chuyên viên phân tích",
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireAdminPageRole(allReportingRoles);
  const userManager = actor.role === "SUPER_ADMIN" || actor.role === "ADMIN";
  return <div className="admin-shell admin-workspace">
    <AdminNavigation userManager={userManager} analyticsAccess={actor.role !== "FINANCE_OPERATOR"}
      billingAccess={actor.role !== "ANALYST"} />
    <div className="admin-main">
      <header className="admin-banner"><div className="admin-banner-title"><span className="admin-eyebrow">FINOVA / ADMIN CONSOLE</span>
        <h1>Trung tâm quản trị</h1><p>Điều hành hệ thống, theo dõi hoạt động và xử lý công việc.</p></div>
        <span className="admin-role">{roleNames[actor.role]}</span></header>
      <main id="admin-content" className="admin-content">{children}</main>
    </div>
  </div>;
}
