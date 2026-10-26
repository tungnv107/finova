"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity, ArrowLeft, ChartNoAxesCombined, ChevronDown, CreditCard,
  LayoutDashboard, Menu, ShieldCheck, UsersRound, X,
} from "lucide-react";

type Props = { userManager: boolean; analyticsAccess: boolean; billingAccess: boolean };

export function isAdminNavActive(pathname: string, href: string) {
  return pathname === href || (href !== "/admin" && pathname.startsWith(href + "/"));
}

const adminSections = (userManager: boolean, analyticsAccess: boolean, billingAccess: boolean) => [
  { title: "Tài khoản & Premium", icon: UsersRound, links: [
    { href: "/admin/users", label: "Người dùng", visible: userManager },
    { href: "/admin/subscriptions", label: "Yêu cầu Premium", visible: userManager },
  ] },
  { title: "Thu phí", icon: CreditCard, links: [
    { href: "/admin/billing/orders", label: "Đơn thu phí", visible: billingAccess },
    { href: "/admin/billing/payments", label: "Đối soát thanh toán", visible: billingAccess },
    { href: "/admin/billing/prices", label: "Bảng giá", visible: userManager },
    { href: "/admin/billing/accounts", label: "Tài khoản nhận phí", visible: userManager },
  ] },
  { title: "Giám sát & báo cáo", icon: Activity, links: [
    { href: "/admin/billing/operations", label: "Cảnh báo vận hành", visible: billingAccess },
    { href: "/admin/billing/notices", label: "Hàng lỗi thông báo", visible: billingAccess },
    { href: "/admin/billing/analytics", label: "Phân tích thu phí", visible: billingAccess },
    { href: "/admin/analytics", label: "Thống kê truy cập", visible: analyticsAccess },
    { href: "/admin/audit", label: "Nhật ký quản trị", visible: userManager },
  ] },
];

export function AdminNavigation({ userManager, analyticsAccess, billingAccess }: Props) {
  const pathname = usePathname();
  const [openPath, setOpenPath] = useState<string | null>(null);
  const mobileOpen = openPath === pathname;
  useEffect(() => {
    if (!mobileOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpenPath(null); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileOpen]);
  const sections = adminSections(userManager, analyticsAccess, billingAccess);

  return <>
    <button className="admin-mobile-toggle" type="button" aria-label={mobileOpen ? "Đóng menu quản trị" : "Mở menu quản trị"}
      aria-expanded={mobileOpen} aria-controls="admin-sidebar" onClick={() => setOpenPath(mobileOpen ? null : pathname)}>
      {mobileOpen ? <X size={21} aria-hidden /> : <Menu size={21} aria-hidden />}
    </button>
    {mobileOpen && <button type="button" className="admin-mobile-backdrop" aria-label="Đóng menu quản trị" onClick={() => setOpenPath(null)} />}
    <aside id="admin-sidebar" className={"admin-sidebar" + (mobileOpen ? " is-open" : "")} aria-label="Menu quản trị">
      <div className="admin-sidebar-brand"><div className="admin-brand-icon"><ShieldCheck size={23} aria-hidden="true" /></div>
        <div><span>FINOVA</span><strong>ADMIN CONSOLE</strong></div></div>
      <p className="admin-nav-caption">KHÔNG GIAN QUẢN TRỊ</p>
      <nav className="admin-tabs" aria-label="Điều hướng quản trị">
        <Link className="admin-nav-home" aria-current={pathname === "/admin" ? "page" : undefined} href="/admin" onClick={() => setOpenPath(null)}>
          <LayoutDashboard size={18} aria-hidden="true" /> Tổng quan
        </Link>
        {sections.map(section => {
          const links = section.links.filter(link => link.visible);
          if (!links.length) return null;
          const active = links.some(link => isAdminNavActive(pathname, link.href));
          const Icon = section.icon;
          return <details className="admin-nav-group" key={section.title} open={active || undefined}>
            <summary><Icon size={17} aria-hidden="true" /><span>{section.title}</span><ChevronDown className="admin-nav-chevron" size={15} aria-hidden="true" /></summary>
            <div className="admin-nav-links">{links.map(link => <Link key={link.href}
              aria-current={isAdminNavActive(pathname, link.href) ? "page" : undefined} href={link.href} onClick={() => setOpenPath(null)}>
              {link.label}</Link>)}</div>
          </details>;
        })}
      </nav>
      <div className="admin-nav-footer">
        <div className="admin-nav-footer-label"><ChartNoAxesCombined size={16} aria-hidden="true" /> Khu vực vận hành nội bộ</div>
        <Link className="admin-nav-exit" href="/dashboard"><ArrowLeft size={17} aria-hidden="true" />Về tài khoản cá nhân</Link>
      </div>
    </aside>
  </>;
}
