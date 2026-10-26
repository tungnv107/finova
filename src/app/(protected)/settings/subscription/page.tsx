import Link from "next/link";
import { requirePageContext } from "@/server/page-context";
import { getEffectiveSubscription } from "@/server/premium";
import { checkoutEnabled, getPublishedPrices, listBillingOrders } from "@/modules/billing/service";
import { billingOrderStatusLabel, formatVietnamDateTime, formatVnd } from "@/modules/billing/subscription-view";
import { PremiumPeriodCards } from "@/components/premium-period-cards";
import { BillingOrderProgress } from "@/components/billing-order-progress";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function SubscriptionPage() {
  const context = await requirePageContext();
  const [subscription, prices, orders, notices] = await Promise.all([
    getEffectiveSubscription(context.userId), getPublishedPrices(), listBillingOrders(context.userId),
    prisma.billingNotice.findMany({ where: { userId: context.userId },
      select: { id: true, orderId: true, createdAt: true, kind: true },
      orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  return <div className="subscription-page">
    <div className="page-head"><div><h1 className="page-title">Gói tài khoản</h1>
      <p className="subtitle">Theo dõi quyền Premium, thời hạn và lịch sử thanh toán của bạn.</p></div>
      <Link className="button button-outline" href="/settings">Trở về cài đặt</Link></div>

    <section className="card card-pad subscription-current" aria-labelledby="subscription-current-title">
      <div><span className="hero-label">GÓI ĐANG SỬ DỤNG</span>
        <h2 id="subscription-current-title">{subscription.plan === "PREMIUM" ? "Finova Premium" : "Finova Lite"}</h2>
        <p className="subscription-current-detail" role="status">{subscription.plan === "PREMIUM" && subscription.expiresAt
          ? `Premium có hiệu lực đến ${formatVietnamDateTime(subscription.expiresAt)} (giờ Việt Nam).`
          : "Lite miễn phí, không thời hạn."}</p>
        <p className="subscription-plan-note">Ví, giao dịch và báo cáo vẫn được giữ nguyên khi Premium hết hạn hoặc bị thu hồi.</p>
      </div>
      <span className={`subscription-badge ${subscription.plan === "PREMIUM" ? "is-premium" : ""}`}>
        {subscription.plan === "PREMIUM" ? "Đang có hiệu lực" : "Gói miễn phí"}
      </span>
    </section>

    <section className="subscription-section" aria-labelledby="subscription-options-title">
      <div className="section-header"><div><h2 id="subscription-options-title" className="section-title">{subscription.plan === "PREMIUM" ? "Gia hạn Premium" : "Nâng cấp Premium"}</h2>
        <p className="subtitle">Hai kỳ hạn: theo tháng hoặc năm. Chỉ tạo đơn khi giá đã công bố và thanh toán được mở.</p></div></div>
      <PremiumPeriodCards prices={prices} currentPlan={subscription.plan} />
      <p className="subscription-help">Quyền Premium chỉ được kích hoạt hoặc gia hạn sau khi thanh toán được xác minh. Bạn có thể tiếp tục dùng Lite và không mất dữ liệu đã lưu.</p>
    </section>

    {notices.length > 0 && <section className="card card-pad subscription-section" aria-labelledby="subscription-notices-title">
      <h2 id="subscription-notices-title" className="section-title">Xác nhận kích hoạt</h2>
      <p className="subtitle">Thông báo về gói vẫn xem được sau khi Premium hết hạn.</p>
      <div className="legend-list">{notices.map(notice => <div className="legend-row" key={notice.id}>
        <div><strong>{notice.kind === "PREMIUM_ACTIVATED" ? "Premium đã kích hoạt hoặc gia hạn" : "Cập nhật gói tài khoản"}</strong><br />
          <small>{formatVietnamDateTime(notice.createdAt)}</small></div>
        <Link className="button button-outline" href={`/billing/checkout/${notice.orderId}`}>Xem chi tiết</Link>
      </div>)}</div>
    </section>}

    <section className="card card-pad subscription-section" aria-labelledby="subscription-history-title">
      <h2 id="subscription-history-title" className="section-title">Lịch sử đơn hàng gần đây</h2>
      {orders.length === 0 ? <p className="subtitle">Bạn chưa có đơn hàng Premium.</p> : <div className="subscription-orders">
        {orders.map(order => <div key={order.id} className="subscription-history-entry">
          <div className="subscription-order">
            <div><strong>{order.orderCode}</strong><span>{order.period === "MONTH" ? "Premium tháng" : "Premium năm"} · {formatVnd(order.amountVnd)} VNĐ</span>
              <small>{formatVietnamDateTime(order.createdAt)}</small></div>
            <div className="subscription-order-action"><span className="subscription-badge">{billingOrderStatusLabel(order.status, order.activatedAt)}</span>
              <Link href={`/billing/checkout/${order.id}`} className="button button-outline">Xem đơn</Link></div>
          </div>
          <details className="subscription-order-details">
            <summary>Xem tiến độ và xác minh đơn {order.orderCode}</summary>
            <BillingOrderProgress status={order.status} createdAt={order.createdAt} expiresAt={order.expiresAt}
              paidAt={order.paidAt} activatedAt={order.activatedAt} checkoutOpen={checkoutEnabled()} />
          </details>
        </div>)}
      </div>}
    </section>
  </div>;
}
