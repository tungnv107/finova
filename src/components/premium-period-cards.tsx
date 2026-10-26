import { PremiumCheckoutButton } from "@/components/premium-checkout-button";
import { formatVnd, premiumPeriodOptions, type PublishedPrice } from "@/modules/billing/subscription-view";

export function PremiumPeriodCards({ prices, currentPlan }: {
  prices: ReadonlyArray<PublishedPrice>;
  currentPlan: "LITE" | "PREMIUM";
}) {
  const options = premiumPeriodOptions(prices);
  return <div className="subscription-plans" role="group" aria-label="Hai lựa chọn gói Premium">
    {options.map(option => <section className="card card-pad subscription-plan" key={option.productCode}
      aria-label={`Premium ${option.billingPeriod === "MONTH" ? "tháng" : "năm"}`}>
      <div className="subscription-plan-heading">
        <span className="hero-label">PREMIUM · {option.billingPeriod === "MONTH" ? "HÀNG THÁNG" : "HÀNG NĂM"}</span>
        {option.billingPeriod === "YEAR" && <span className="subscription-badge">Kỳ hạn tiết kiệm</span>}
      </div>
      <p className="subscription-price"><strong>{formatVnd(option.priceVnd)} VNĐ</strong><span>/{option.billingPeriod === "MONTH" ? "tháng" : "năm"}</span></p>
      <p className="subscription-plan-note">Nhập sao kê, đồng bộ ngân hàng khi được hỗ trợ và nhận thông báo.</p>
      <PremiumCheckoutButton priceId={option.priceId} available={option.available}>
        {currentPlan === "PREMIUM" ? "Gia hạn" : "Nâng cấp"} · {option.billingPeriod === "MONTH" ? "1 tháng" : "1 năm"}
      </PremiumCheckoutButton>
      {!option.available && <p className="subscription-unavailable" role="status">Kỳ hạn này chưa mở thanh toán. Không chuyển khoản khi chưa có đơn hợp lệ.</p>}
    </section>)}
  </div>;
}
