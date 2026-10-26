import Link from "next/link";
import { requirePageContext } from "@/server/page-context";
import { getPublishedPrices } from "@/modules/billing/service";
import { getEffectiveSubscription } from "@/server/premium";
import { PremiumPeriodCards } from "@/components/premium-period-cards";

export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const context = await requirePageContext();
  const [prices, subscription] = await Promise.all([getPublishedPrices(), getEffectiveSubscription(context.userId)]);
  return <div className="subscription-page">
    <div className="page-head"><div><h1 className="page-title">Chọn gói Finova</h1>
      <p className="subtitle">Lite cho quản lý tài chính cơ bản. Premium mở thêm nhập và đồng bộ sao kê, thông báo.</p></div>
      <Link className="button button-outline" href="/settings/subscription">Gói của tôi</Link></div>
    <section className="card card-pad subscription-lite"><span className="hero-label">FINOVA LITE · MIỄN PHÍ</span>
      <h2>0 VNĐ <small>/không thời hạn</small></h2>
      <p>Ví, giao dịch thu chi, ngân sách, mục tiêu và báo cáo tài chính.</p>
      <strong>{subscription.plan === "LITE" ? "Gói đang sử dụng" : "Các tính năng luôn sẵn có"}</strong>
    </section>
    <section className="subscription-section" aria-label="Bảng giá Premium">
      <PremiumPeriodCards prices={prices} currentPlan={subscription.plan} />
    </section>
    <section className="card card-pad subscription-section">
      <h2 className="section-title">So sánh quyền sử dụng</h2>
      <p>Premium bao gồm các tính năng Lite cùng nhập sao kê, đồng bộ ngân hàng khi được hỗ trợ và thông báo.</p>
      <p className="subscription-help">Chỉ kích hoạt Premium sau khi xác minh thanh toán vào tài khoản nhận phí được duyệt. Dữ liệu cá nhân được giữ nguyên khi đổi gói hoặc hết hạn.</p>
    </section>
  </div>;
}
