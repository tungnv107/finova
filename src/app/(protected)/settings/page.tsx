import Link from "next/link";
import { Bell, CalendarClock, ChartNoAxesCombined, ChevronRight, CreditCard, FileUp, HandCoins, ShieldCheck, Tags, Target, WalletCards, ChartPie, ArrowLeftRight } from "lucide-react";
import { requirePageContext } from "@/server/page-context";
import { prisma } from "@/lib/db";
import { ThemeSelector } from "@/components/theme-selector";
import { hasPremiumFeature } from "@/server/premium";

const features = [
  { href: "/reports", title: "Báo cáo", detail: "Dòng tiền và tài sản", icon: ChartNoAxesCombined },
  { href: "/budgets", title: "Ngân sách", detail: "Theo dõi hạn mức", icon: ChartPie },
  { href: "/goals", title: "Mục tiêu", detail: "Kế hoạch tiết kiệm", icon: Target },
  { href: "/categories", title: "Danh mục", detail: "Sắp xếp thu chi", icon: Tags },
  { href: "/recurring", title: "Định kỳ", detail: "Khoản thu chi lặp lại", icon: CalendarClock },
  { href: "/imports", title: "Nhập sao kê", detail: "Nhập dữ liệu ngân hàng", icon: FileUp },
  { href: "/cards", title: "Thẻ tín dụng", detail: "Hạn mức và dư nợ", icon: CreditCard },
  { href: "/debts", title: "Vay nợ", detail: "Phải thu và phải trả", icon: HandCoins },
  { href: "/notifications", title: "Thông báo", detail: "Hoạt động tài khoản", icon: Bell },
  { href: "/wallets", title: "Ví & tài khoản", detail: "Số dư từng ví", icon: WalletCards },
  { href: "/transactions", title: "Giao dịch", detail: "Lịch sử thu chi", icon: ArrowLeftRight },
];

export default async function SettingsPage() {
  const ctx = await requirePageContext();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.userId }, select: { name: true, email: true, emailVerified: true, preferences: true } });
  const utilitiesEnabled = await hasPremiumFeature(ctx.userId, "STATEMENT_IMPORT");
  return <>
    <div className="page-head"><div><h1 className="page-title">Cá nhân</h1><p className="subtitle">Quản lý tài khoản và khám phá tiện ích Finova.</p></div></div>
    <section className="profile-hero" aria-label="Thông tin tài khoản">
      <div className="profile-avatar" aria-hidden="true">{(user.name || user.email).charAt(0).toUpperCase()}</div>
      <div><span className="hero-label">TÀI KHOẢN CỦA BẠN</span><h2>{user.name || "Người dùng Finova"}</h2><p>{user.email}</p><span className="profile-verified"><ShieldCheck size={15} /> {user.emailVerified ? "Email đã xác minh" : "Email chưa xác minh"}</span></div>
    </section>
    <section className="card card-pad settings-appearance" aria-labelledby="appearance-title"><div><h2 id="appearance-title" className="section-title">Giao diện</h2><p className="section-subtitle">Chọn chế độ hiển thị phù hợp với bạn.</p></div><ThemeSelector /></section>
    <section className="card card-pad"><div className="section-header"><div><h2 className="section-title">Gói tài khoản</h2><p className="section-subtitle">{utilitiesEnabled ? "Xem trạng thái và thời hạn gói của bạn." : "Mở khóa nhập sao kê, đồng bộ ngân hàng và thông báo với Premium."}</p></div><Link className="button button-primary" href="/settings/subscription">Quản lý gói</Link></div></section>
    <section id="features" className="settings-features" aria-labelledby="features-title"><div className="dashboard-headline"><h2 id="features-title">Tất cả tính năng</h2><p>Truy cập nhanh các công cụ đang có trong Finova.</p></div>
      <div className="feature-grid">{features.filter(item => utilitiesEnabled || !["/imports", "/bank-sync", "/notifications"].includes(item.href)).map(({ href, title, detail, icon: Icon }) => <Link className="feature-tile" href={href} key={href}><span className="feature-icon"><Icon size={20} aria-hidden="true" /></span><span className="feature-text"><strong>{title}</strong><small>{detail}</small></span><ChevronRight className="feature-chevron" size={17} aria-hidden="true" /></Link>)}</div>
    </section>
    <section className="card card-pad settings-details" aria-labelledby="account-title"><h2 id="account-title" className="section-title">Thông tin & thiết lập tài khoản</h2>
      <div className="legend-list"><div className="legend-row"><span>Tên hiển thị</span><strong>{user.name}</strong></div><div className="legend-row"><span>Email</span><strong>{user.email}</strong></div><div className="legend-row"><span>Đơn vị tiền tệ</span><strong>{user.preferences?.currency || "VND"}</strong></div><div className="legend-row"><span>Múi giờ báo cáo</span><strong>Asia/Ho_Chi_Minh</strong></div><div className="legend-row"><span>Ngôn ngữ</span><strong>Tiếng Việt</strong></div></div>
      <p className="section-subtitle">Finova hiện hỗ trợ sổ cái một tiền tệ VND.</p>
    </section>
  </>;
}
