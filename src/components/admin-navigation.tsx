"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, CreditCard, LayoutDashboard, LogOut, Settings2, ShieldCheck } from "lucide-react";

type Props = { userManager: boolean; analyticsAccess: boolean; billingAccess: boolean };

export function isAdminNavActive(pathname: string, href: string) {
  return pathname === href || (href !== "/admin" && pathname.startsWith(`${href}/`));
}

export function AdminNavigation({ userManager, analyticsAccess, billingAccess }: Props) {
  const pathname = usePathname();
  const sections = [
    { title: "Không gian làm việc", icon: LayoutDashboard, links: [
      { href: "/admin", label: "Tổng quan", visible: true },
      { href: "/admin/users", label: "Người dùng", visible: userManager },
      { href: "/admin/subscriptions", label: "Yêu cầu Premium", visible: userManager },
      { href: "/admin/analytics", label: "Thống kê truy cập", visible: analyticsAccess },
    ] },
    { title: "Gói & thanh toán", icon: CreditCard, links: [
      { href: "/admin/billing/prices", label: "Bảng giá", visible: userManager },
      { href: "/admin/billing/accounts", label: "Tài khoản nhận phí", visible: userManager },
      { href: "/admin/billing/orders", label: "Đơn thu phí", visible: billingAccess },
      { href: "/admin/billing/payments", label: "Đối soát thanh toán", visible: billingAccess },
      { href: "/admin/billing/analytics", label: "Phân tích thu phí", visible: billingAccess },
    ] },
    { title: "Vận hành & kiểm soát", icon: Settings2, links: [
      { href: "/admin/billing/operations", label: "Cảnh báo vận hành", visible: billingAccess },
      { href: "/admin/billing/notices", label: "Hàng lỗi thông báo", visible: billingAccess },
      { href: "/admin/audit", label: "Nhật ký quản trị", visible: userManager },
    ] },
  ];

  return <aside className="admin-sidebar" aria-label="Menu quản trị">
    <div className="admin-sidebar-brand"><ShieldCheck size={20} aria-hidden="true" /><span>FINOVA <strong>ADMIN</strong></span></div>
    <nav className="admin-tabs" aria-label="Điều hướng quản trị">
      {sections.map(section => {
        const links = section.links.filter(link => link.visible);
        if (!links.length) return null;
        const active = links.some(link => isAdminNavActive(pathname, link.href));
        const Icon = section.icon;
        return <details className="admin-nav-group" key={section.title} open={active || undefined}>
          <summary><Icon size={16} aria-hidden="true" />{section.title}<ChevronDown className="admin-nav-chevron" size={14} aria-hidden="true" /></summary>
          <div className="admin-nav-links">{links.map(link => <Link key={link.href}
            aria-current={isAdminNavActive(pathname, link.href) ? "page" : undefined} href={link.href}>
            {link.label}</Link>)}</div>
        </details>;
      })}
    </nav>
    <Link className="admin-nav-exit" href="/settings"><LogOut size={16} aria-hidden="true" />Về tài khoản cá nhân</Link>
  </aside>;
}
