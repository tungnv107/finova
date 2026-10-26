import Link from "next/link";
import Image from "next/image";
import { requirePageContext } from "@/server/page-context";
import { checkoutEnabled, getBillingOrder } from "@/modules/billing/service";
import { vietQrImageUrl } from "@/modules/billing/vietqr";
import { CopyPaymentButton } from "@/components/copy-payment-button";
import { BillingOrderProgress } from "@/components/billing-order-progress";
import { billingOrderStatusDescription, billingOrderStatusLabel } from "@/modules/billing/subscription-view";

export const dynamic = "force-dynamic";

export default async function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requirePageContext();
  const { id } = await params;
  const order = await getBillingOrder(context.userId, id);
  const canTransfer = order.status === "PENDING_PAYMENT" && checkoutEnabled();
  const qrImage = canTransfer ? vietQrImageUrl({
    bankCode: order.bank.code, accountNumber: order.bank.accountNumber,
    accountName: order.bank.accountName, amountVnd: order.amountVnd,
    transferReference: order.transferReference,
  }) : null;
  return <div>
    <div className="page-head"><div><h1 className="page-title">Thanh toán Premium</h1>
      <p className="subtitle">Đơn hàng {order.orderCode} · {billingOrderStatusLabel(order.status, order.activatedAt)}</p></div>
      <Link className="button button-outline" href="/settings/subscription">Lịch sử đơn hàng</Link></div>
    <section className="card card-pad">
      <h2 className="section-title">{order.productCode === "PREMIUM_MONTHLY" ? "Premium · 1 tháng" : "Premium · 1 năm"}</h2>
      <p><strong>Số tiền: {new Intl.NumberFormat("vi-VN").format(order.amountVnd)} VNĐ</strong></p>
      <BillingOrderProgress status={order.status} createdAt={order.createdAt} expiresAt={order.expiresAt}
        paidAt={order.paidAt} activatedAt={order.activatedAt} checkoutOpen={checkoutEnabled()} />
      {canTransfer ? <>
        <div className="legend-list">
          <div className="legend-row"><span>Ngân hàng</span><strong>{order.bank.name}</strong></div>
          <div className="legend-row"><span>Chủ tài khoản</span><strong>{order.bank.accountName}</strong></div>
          <div className="legend-row"><span>Số tài khoản</span><div><strong>{order.bank.accountNumber}</strong> <CopyPaymentButton value={order.bank.accountNumber} label="số tài khoản" /></div></div>
          <div className="legend-row"><span>Nội dung chuyển khoản (bắt buộc chính xác)</span><div><strong>{order.transferReference}</strong> <CopyPaymentButton value={order.transferReference} label="nội dung chuyển khoản" /></div></div>
          <div className="legend-row"><span>Hạn thanh toán</span><strong>{new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "long", timeStyle: "short" }).format(order.expiresAt)}</strong></div>
        </div>
        {qrImage ? <figure className="payment-qr">
          <Image unoptimized src={qrImage} width={260} height={260}
            alt={`Mã VietQR chuyển khoản ${new Intl.NumberFormat("vi-VN").format(order.amountVnd)} đồng đến ${order.bank.name}; nội dung ${order.transferReference}`} />
          <figcaption>Quét mã VietQR trong ứng dụng ngân hàng. Kiểm tra tên người nhận, số tiền và nội dung trước khi xác nhận.</figcaption>
        </figure> : <p className="section-subtitle" role="status">
          Không thể tạo VietQR cho ngân hàng hoặc tài khoản này. Vui lòng dùng thông tin chuyển khoản thủ công ở trên.
        </p>}
        <p className="section-subtitle">Vui lòng chuyển chính xác số tiền và nội dung. Premium chỉ kích hoạt sau khi tiền vào được xác thực và đối soát với ngân hàng.</p>
      </> : order.status === "PENDING_PAYMENT" ? <p role="status" className="section-subtitle">
        {billingOrderStatusDescription(order.status, order.activatedAt, checkoutEnabled())}
      </p> : null}
      <Link className="button button-primary" href={`/billing/checkout/${order.id}`}>Tải lại trạng thái</Link>
    </section>
  </div>;
}
