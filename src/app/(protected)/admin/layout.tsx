import { AdminNavigation } from "@/components/admin-navigation";
import { requireAdminPageRole } from "@/server/admin-page";
import { allReportingRoles } from "@/server/system-auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireAdminPageRole(allReportingRoles);
  const userManager = actor.role === "SUPER_ADMIN" || actor.role === "ADMIN";
  return <section className="admin-shell">
    <div className="admin-banner"><div><span className="hero-label">FINOVA · SYSTEM ADMIN</span>
      <h1>Trung tâm quản trị</h1><p>Quản lý tài khoản, gói Premium và vận hành nền tảng.</p></div>
      <span className="admin-role">{actor.role.replaceAll("_", " ")}</span></div>
    <AdminNavigation userManager={userManager} analyticsAccess={actor.role !== "FINANCE_OPERATOR"}
      billingAccess={actor.role !== "ANALYST"} />
    <div id="admin-content" className="admin-content">{children}</div>
  </section>;
}
