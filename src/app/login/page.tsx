import { redirect } from "next/navigation";
import { ShieldCheck, ChartNoAxesCombined, Wallet } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { GoogleLogin } from "@/components/google-login";
import { getContext } from "@/server/context";
import { googleConfigured } from "@/server/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getContext()) redirect("/onboarding");
  return <main className="login-page"><section className="login-hero"><div className="login-brand-plaque"><BrandLogo width={290} /></div><h1>Rõ từng khoản chi.<br />Vững vàng tương lai.</h1><p>Finova giúp bạn kiểm soát dòng tiền, theo dõi số dư và hiểu tài chính của mình qua những báo cáo trực quan.</p><div className="login-feature"><Wallet size={22} /> Quản lý mọi ví tại một nơi</div><div className="login-feature"><ChartNoAxesCombined size={22} /> Số liệu cập nhật từ giao dịch thực</div><div className="login-feature"><ShieldCheck size={22} /> Không gian dữ liệu cá nhân riêng tư</div></section><section className="login-panel"><div className="login-box"><div className="pill" style={{ width: "fit-content" }}>CHÀO MỪNG ĐẾN FINOVA</div><h2>Bắt đầu hành trình tài chính</h2><p className="subtitle">Đăng nhập để quản lý thu chi và theo dõi tài chính của bạn.</p><GoogleLogin configured={googleConfigured} /><p className="login-footnote">Đăng nhập chỉ yêu cầu thông tin hồ sơ cơ bản từ Google (tên, email, ảnh đại diện). Finova không yêu cầu quyền Gmail hoặc dữ liệu ngân hàng của bạn.</p></div></section></main>;
}
