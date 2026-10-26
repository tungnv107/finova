import { AdminNavigation } from "@/components/admin-navigation";
import { requireAdminPageRole } from "@/server/admin-page";
import { allReportingRoles } from "@/server/system-auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireAdminPageRole(allReportingRoles);
  const userManager = actor.role === "SUPER_ADMIN" || actor.role === "ADMIN";
  return <section className="admin-shell">
    <AdminNavigation userManager={userManager} analyticsAccess={actor.role !== "FINANCE_OPERATOR"}
      billingAccess={actor.role !== "ANALYST"} />
    <main id="admin-content" className="admin-content">
      <div className="admin-banner"><div><span className="hero-label">BẢNG ĐIỀU KHIỂN / FINOVA</span>
        <h1>Trung tâm quản trị</h1><p>Người dùng · Gói dịch vụ · Vận hành</p></div>
        <span className="admin-role">{actor.role === "SUPER_ADMIN" ? "Super Admin · Premium" : actor.role.replaceAll("_", " ")}</span></div>
      {children}
    </main>
  </section>;
}
