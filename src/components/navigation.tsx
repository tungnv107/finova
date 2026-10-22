"use client";

import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, ArrowLeftRight, Wallet, Settings, LogOut, ChartNoAxesCombined, Tags, ChartPie, Target, HandCoins, CreditCard, CalendarClock, Bell, FileUp, Landmark, Plus, UserRound, Grid2X2, ChevronDown, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { useState } from "react";
import { QuickTransactionSheet } from "@/components/quick-transaction-sheet";

const primary = [
  { href: "/dashboard", label: "Tổng quan", icon: LayoutDashboard },
  { href: "/transactions", label: "Giao dịch", icon: ArrowLeftRight },
  { href: "/wallets", label: "Ví & tài khoản", icon: Wallet },
  { href: "/reports", label: "Báo cáo", icon: ChartNoAxesCombined },
];
const planning = [
  { href: "/budgets", label: "Ngân sách", icon: ChartPie },
  { href: "/goals", label: "Mục tiêu", icon: Target },
  { href: "/recurring", label: "Định kỳ", icon: CalendarClock },
];
const management = [
  { href: "/categories", label: "Danh mục", icon: Tags },
  { href: "/cards", label: "Thẻ tín dụng", icon: CreditCard },
  { href: "/debts", label: "Vay nợ", icon: HandCoins },
];
const more = [
  { href: "/imports", label: "Nhập sao kê", icon: FileUp },
  { href: "/bank-sync", label: "Đồng bộ sao kê", icon: Landmark },
  { href: "/notifications", label: "Thông báo", icon: Bell },
];

type NavItem = (typeof primary)[number];

function NavGroup({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return <div className="nav-group">{items.map(({ href, label, icon: Icon }) => {
    const active = path === href || path.startsWith(`${href}/`);
    return <Link key={href} href={href} className={`nav-item ${active ? "active" : ""}`} aria-current={active ? "page" : undefined} title={label}><Icon aria-hidden="true" /><span>{label}</span></Link>;
  })}</div>;
}

function NavSection({ title, id, items, icon: Icon }: { title: string; id: string; items: NavItem[]; icon: typeof LayoutDashboard }) {
  const path = usePathname();
  const hasActivePage = items.some(({ href }) => path === href || path.startsWith(`${href}/`));
  // A route change reveals its section; an explicit click can always collapse it.
  const [choice, setChoice] = useState<{ path: string; open: boolean } | null>(null);
  const expanded = choice?.path === path ? choice.open : hasActivePage;
  return <section className={`nav-section ${expanded ? "is-expanded" : ""} ${hasActivePage ? "has-current" : ""}`}>
    <button type="button" className="nav-section-toggle" aria-expanded={expanded} aria-controls={id} aria-label={`${title} (${items.length} mục)`} title={title} onClick={() => setChoice({ path, open: !expanded })}>
      <Icon className="nav-section-icon" aria-hidden="true" />
      <span className="nav-section-label">{title}</span>
      <ChevronDown className="nav-section-chevron" aria-hidden="true" />
    </button>
    <div id={id} className="nav-section-content" hidden={!expanded}><NavGroup items={items} /></div>
  </section>;
}

export function NavLinks() {
  return <div className="nav-sections">
    <div className="nav-caption">THƯỜNG DÙNG</div>
    <NavGroup items={primary} />
    <div className="nav-divider" />
    <NavSection id="nav-planning" title="Kế hoạch" icon={ChartPie} items={planning} />
    <NavSection id="nav-management" title="Quản lý tài chính" icon={Wallet} items={management} />
    <NavSection id="nav-utilities" title="Công cụ & thông báo" icon={SlidersHorizontal} items={more} />
  </div>;
}

const pageTitles: Record<string, string> = {
  "/dashboard": "Tổng quan", "/transactions": "Giao dịch", "/wallets": "Ví & tài khoản",
  "/reports": "Báo cáo", "/budgets": "Ngân sách", "/goals": "Mục tiêu",
  "/categories": "Danh mục", "/recurring": "Định kỳ", "/cards": "Thẻ tín dụng",
  "/debts": "Vay nợ", "/imports": "Nhập sao kê", "/notifications": "Thông báo",
  "/settings": "Cài đặt tài khoản", "/bank-sync": "Đồng bộ sao kê",
};

export function PageLocation() {
  const pathname = usePathname();
  const route = Object.keys(pageTitles).find(href => pathname === href || pathname.startsWith(`${href}/`));
  return <div className="crumb" aria-label="Vị trí hiện tại">
    <span>Không gian tài chính <span aria-hidden="true" className="crumb-separator">/</span> Cá nhân</span>
    <strong>{route ? pageTitles[route] : "Finova"}</strong>
  </div>;
}

export function TopbarQuickAction() {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="button button-primary topbar-quick-action" onClick={() => setOpen(true)} aria-haspopup="dialog"><Plus size={17} aria-hidden="true" /> Thêm giao dịch</button>
    <QuickTransactionSheet open={open} onClose={() => setOpen(false)} />
  </>;
}

const tabs = [
  { href: "/dashboard", label: "Tổng quan", icon: LayoutDashboard },
  { href: "/transactions", label: "Giao dịch", icon: ArrowLeftRight },
  { href: "/wallets", label: "Ví", icon: Wallet },
  { href: "/settings", label: "Cá nhân", icon: UserRound },
];

export function MobileBottomNav() {
  const path = usePathname();
  const [quickOpen, setQuickOpen] = useState(false);
  return <>
    <nav aria-label="Điều hướng điện thoại" className="mobile-nav">
      {tabs.slice(0, 2).map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`mobile-link ${path === href ? "active" : ""}`} aria-current={path === href ? "page" : undefined}><Icon aria-hidden="true" /><span>{label}</span></Link>)}
      <div className="mobile-fab-slot"><button type="button" className="mobile-fab" aria-label="Thêm giao dịch" aria-haspopup="dialog" onClick={() => setQuickOpen(true)}><Plus aria-hidden="true" size={28} /></button><span className="mobile-fab-label">Thêm mới</span></div>
      {tabs.slice(2).map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`mobile-link ${path === href ? "active" : ""}`} aria-current={path === href ? "page" : undefined}><Icon aria-hidden="true" /><span>{label}</span></Link>)}
    </nav>
    <QuickTransactionSheet open={quickOpen} onClose={() => setQuickOpen(false)} />
  </>;
}

export function FeaturesLink() { return <Link href="/settings#features" className="button button-soft"><Grid2X2 size={17} /> Tất cả tính năng</Link>; }

export function SignOut() {
  const router = useRouter();
  return <button type="button" className="nav-item sign-out" aria-label="Đăng xuất" title="Đăng xuất" onClick={async () => { await authClient.signOut(); router.replace("/login"); router.refresh(); }}><LogOut size={18} aria-hidden="true" /> <span>Đăng xuất</span></button>;
}

export function SettingsLink() { return <Link href="/settings" className="nav-item" aria-label="Cài đặt tài khoản" title="Cài đặt tài khoản"><Settings size={18} aria-hidden="true" /><span>Cài đặt tài khoản</span></Link>; }
