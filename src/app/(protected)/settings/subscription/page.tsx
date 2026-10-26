import Link from "next/link";
import { requirePageContext } from "@/server/page-context";
import { getEffectiveSubscription } from "@/server/premium";
import { checkoutEnabled, getPublishedPrices, listBillingOrders } from "@/modules/billing/service";
import { billingOrderStatusLabel, formatVietnamDateTime, formatVnd } from "@/modules/billing/subscription-view";
import { PremiumPeriodCards } from "@/components/premium-period-cards";
import { BillingOrderProgress } from "@/components/billing-order-progress";
import { prisma } from "@/lib/db";
import { listMyPremiumRegistrations } from "@/modules/billing/manual-subscriptions";
import { PremiumRegistrationForm } from "@/components/premium-registration-form";

export const dynamic = "force-dynamic";

export default async function SubscriptionPage() {
  const context = await requirePageContext();
  const registrationsEnabled = process.env.FINOVA_ADMIN_ENABLED === "1";
  const [subscription, prices, orders, notices, registrations] = await Promise.all([
    getEffectiveSubscription(context.userId), getPublishedPrices(), listBillingOrders(context.userId),
    prisma.billingNotice.findMany({ where: { userId: context.userId },
      select: { id: true, orderId: true, createdAt: true, kind: true },
      orderBy: { createdAt: "desc" }, take: 10 }),
    registrationsEnabled ? listMyPremiumRegistrations(context.userId) : Promise.resolve([]),
  ]);
  const privilegedAssignment = registrationsEnabled && subscription.plan === "LITE"
    ? await prisma.systemRoleAssignment.findFirst({
      where: { userId: context.userId, revokedAt: null }, select: { id: true },
    }) : null;
  const hasPermanentAdminPremium = subscription.plan === "PREMIUM" && subscription.expiresAt === null;
  return <div className="subscription-page">
    <div className="page-head"><div><h1 className="page-title">Gói tài khoản</h1>
      <p className="subtitle">Theo dõi quyền Premium, thời hạn và lịch sử thanh toán của bạn.</p></div>
      <Link className="button button-outline" href="/settings">Trở về cài đặt</Link></div>

    <section className="card card-pad subscription-current" aria-labelledby="subscription-current-title">
      <div><span className="hero-label">GÓI ĐANG SỬ DỤNG</span>
        <h2 id="subscription-current-title">{subscription.plan === "PREMIUM" ? "Finova Premium" : "Finova Lite"}</h2>
        <p className="subscription-current-detail" role="status">{subscription.plan === "PREMIUM"
          ? subscription.expiresAt ? `Premium có hiệu lực đến ${formatVietnamDateTime(subscription.expiresAt)} (giờ Việt Nam).`
            : "Premium dành cho Super Admin, không giới hạn thời gian theo vai trò."
          : "Lite miễn phí, không thời hạn."}</p>
        <p className="subscription-plan-note">Ví, giao dịch và báo cáo vẫn được giữ nguyên khi Premium hết hạn hoặc bị thu hồi.</p>
      </div>
      <span className={`subscription-badge ${subscription.plan === "PREMIUM" ? "is-premium" : ""}`}>
        {subscription.plan === "PREMIUM" ? "Đang có hiệu lực" : "Gói miễn phí"}
      </span>
    </section>

    {subscription.plan === "LITE" && registrationsEnabled && !privilegedAssignment && <section className="card card-pad subscription-section" aria-labelledby="premium-registration-title">
      <span className="hero-label">ĐĂNG KÝ THỦ CÔNG</span>
      <h2 id="premium-registration-title" className="section-title">Gửi yêu cầu Premium</h2>
      <p className="subtitle">Trong thời gian thanh toán tự động chưa mở, bạn có thể gửi đăng ký để Super Admin xem xét.
        Quản trị viên kiểm tra điều kiện và xác nhận thanh toán bên ngoài hệ thống trước khi quyết định. Gửi yêu cầu không kích hoạt Premium và không xác nhận đã nhận tiền.</p>
      <PremiumRegistrationForm prices={prices} disabled={registrations.some(r => r.status === "PENDING" && r.expiresAt > new Date())} />
      <p className="subscription-help">Chỉ chuyển khoản theo hướng dẫn chính thức sau khi được cung cấp tài khoản nhận tiền đã xác minh. Không nhập thông tin tài khoản ngân hàng hoặc mã giao dịch vào biểu mẫu này.</p>
    </section>}

    {subscription.plan === "LITE" && registrationsEnabled && privilegedAssignment && <section className="card card-pad subscription-section">
      <h2 className="section-title">Đăng ký Premium</h2>
      <p className="subtitle">Tài khoản có vai trò quản trị hệ thống không sử dụng biểu mẫu đăng ký dành cho người dùng thông thường. Vui lòng liên hệ Super Admin để kiểm tra chính sách gói.</p>
    </section>}

    {registrations.length > 0 && <section className="card card-pad subscription-section" aria-labelledby="premium-request-history">
      <h2 id="premium-request-history" className="section-title">Yêu cầu nâng cấp của tôi</h2>
      <div className="legend-list">{registrations.map(request => <div className="legend-row" key={request.id}>
        <div><strong>Premium {request.billingPeriod === "YEAR" ? "năm" : "tháng"}</strong>
          <div className="section-subtitle">Gửi ngày {formatVietnamDateTime(request.createdAt)}</div>
          {request.reviewReason && <p className="section-subtitle">Phản hồi: {request.reviewReason}</p>}</div>
        <span className="subscription-badge">{request.status === "APPROVED" ? "Đã duyệt" : request.status === "REJECTED" ? "Đã từ chối" :
          request.expiresAt <= new Date() ? "Hết thời hạn xét duyệt" : "Chờ Super Admin duyệt"}</span>
      </div>)}</div>
    </section>}

    {!hasPermanentAdminPremium && <section className="subscription-section" aria-labelledby="subscription-options-title">
      <div className="section-header"><div><h2 id="subscription-options-title" className="section-title">{subscription.plan === "PREMIUM" ? "Gia hạn Premium" : "Nâng cấp Premium"}</h2>
        <p className="subtitle">Hai kỳ hạn: theo tháng hoặc năm. Chỉ tạo đơn khi giá đã công bố và thanh toán được mở.</p></div></div>
      <PremiumPeriodCards prices={prices} currentPlan={subscription.plan} />
      <p className="subscription-help">Quyền Premium chỉ được kích hoạt hoặc gia hạn sau khi thanh toán được xác minh. Bạn có thể tiếp tục dùng Lite và không mất dữ liệu đã lưu.</p>
    </section>}

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
