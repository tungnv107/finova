import { redirect } from "next/navigation";
import { getContext } from "@/server/context";
import { BrandLogo } from "@/components/brand-logo";
import { MobileBottomNav, NavLinks, PageLocation, SettingsLink, SignOut, TopbarQuickAction } from "@/components/navigation";
import { ThemeSelector } from "@/components/theme-selector";
import { Bell, ShieldCheck } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const context = await getContext();
  if (!context) redirect("/login");
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="sidebar-brand"><div className="app-brand-plaque"><span className="sidebar-logo-full"><BrandLogo width={184} /></span><Image className="sidebar-logo-mark" src="/brand/finova-original-symbol-on-white.png" width={39} height={39} alt="Finova" /></div></div>
      <nav aria-label="Điều hướng chính"><NavLinks /></nav>
      <div className="sidebar-spacer" />
      <div className="sidebar-bottom"><SettingsLink /><SignOut /><div className="sidebar-account"><div className="avatar">{context.name.charAt(0).toUpperCase()}</div><div className="sidebar-account-name"><strong>{context.name}</strong><small>Tài khoản cá nhân</small></div></div></div>
    </aside>
    <div className="main"><header className="topbar"><div className="topbar-brand"><span className="mobile-brand"><span className="app-brand-plaque"><BrandLogo width={143} /></span></span><PageLocation /></div><div className="topbar-right"><div className="privacy-label"><ShieldCheck size={16} /> Dữ liệu riêng tư</div><TopbarQuickAction /><ThemeSelector compact /><Link className="topbar-notification icon-button" href="/notifications" aria-label="Thông báo"><Bell size={19} /></Link><Link href="/settings" className="avatar" aria-label="Tài khoản cá nhân">{context.name.charAt(0).toUpperCase()}</Link></div></header><main className="content">{children}</main></div>
    <MobileBottomNav />
  </div>;
}
