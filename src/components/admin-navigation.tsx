"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Props = { userManager: boolean; analyticsAccess: boolean; billingAccess: boolean };

export function isAdminNavActive(pathname: string, href: string) {
  return pathname === href || (href !== "/admin" && pathname.startsWith(`${href}/`));
}

export function AdminNavigation({ userManager, analyticsAccess, billingAccess }: Props) {
  const pathname = usePathname();
  const links = [
    { href: "/admin", label: "Tổng quan", visible: true },
    { href: "/admin/analytics", label: "Thống kê truy cập", visible: analyticsAccess },
    { href: "/admin/users", label: "Người dùng", visible: userManager },
    { href: "/admin/subscriptions", label: "Duyệt Premium", visible: userManager },
    { href: "/admin/billing/prices", label: "Bảng giá", visible: userManager },
    { href: "/admin/billing/accounts", label: "Tài khoản nhận phí", visible: userManager },
    { href: "/admin/billing/payments", label: "Đối soát thanh toán", visible: billingAccess },
    { href: "/admin/billing/orders", label: "Đơn thu phí", visible: billingAccess },
    { href: "/admin/billing/analytics", label: "Phân tích thu phí", visible: billingAccess },
    { href: "/admin/billing/notices", label: "Hàng lỗi thông báo", visible: billingAccess },
    { href: "/admin/billing/operations", label: "Cảnh báo vận hành", visible: billingAccess },
    { href: "/admin/audit", label: "Nhật ký", visible: userManager },
  ];

  return <nav className="admin-tabs" aria-label="Điều hướng quản trị">
    {links.filter(link => link.visible).map(link => <Link key={link.href} href={link.href}
      aria-current={isAdminNavActive(pathname, link.href) ? "page" : undefined}>
      {link.label}
    </Link>)}
    <Link className="admin-nav-exit" href="/settings">Về tài khoản cá nhân</Link>
  </nav>;
}
