import { billingOrderStatusDescription, billingOrderStatusLabel, formatVietnamDateTime } from "@/modules/billing/subscription-view";

type BillingOrderProgressProps = {
  status: string;
  createdAt: Date;
  expiresAt: Date;
  paidAt: Date | null;
  activatedAt: Date | null;
  checkoutOpen: boolean;
};

/** Server-verified progress only. Creating an order never implies that payment was received. */
export function BillingOrderProgress({ status, createdAt, expiresAt, paidAt, activatedAt, checkoutOpen }: BillingOrderProgressProps) {
  const received = status === "PAID" || status === "REFUNDED";
  const activated = received && activatedAt !== null;
  const refunded = status === "REFUNDED";
  const exception = status === "REVIEW" || status === "EXPIRED" || status === "REFUNDED" ||
    (status !== "PENDING_PAYMENT" && status !== "PAID");
  const paymentStep = refunded ? "Đã xác minh tiền vào trước hoàn tiền" : received ? "Đã xác minh tiền vào"
    : status === "EXPIRED" ? "Đơn hết hạn, chưa xác minh tiền vào"
    : status === "REVIEW" ? "Cần đối soát tiền vào" : "Chờ xác minh tiền vào";
  const activationStep = refunded
    ? activated ? "Từng kích hoạt Premium" : "Không ghi nhận kích hoạt Premium"
    : activated ? "Đã kích hoạt Premium"
    : exception ? "Chưa xác nhận kích hoạt Premium" : "Chờ kích hoạt Premium";

  return <section className="billing-progress" aria-label="Tiến độ xử lý đơn hàng">
    <div className="billing-progress-head">
      <h3>Tiến độ đơn hàng</h3>
      <span className="subscription-badge" role="status">{billingOrderStatusLabel(status, activatedAt)}</span>
    </div>
    <ol className="billing-progress-steps">
      <li className="is-done"><strong>Đã tạo đơn</strong><small>{formatVietnamDateTime(createdAt)}</small></li>
      <li className={received ? refunded ? "is-history" : "is-done" : "is-waiting"}>
        <strong>{paymentStep}</strong>
        {received && paidAt ? <small>{formatVietnamDateTime(paidAt)}</small> : <small>Chỉ cập nhật sau khi ngân hàng xác nhận.</small>}
      </li>
      <li className={activated ? refunded ? "is-history" : "is-done" : "is-waiting"}>
        <strong>{activationStep}</strong>
        {activated && activatedAt ? <small>{formatVietnamDateTime(activatedAt)}</small> : <small>Chỉ cấp quyền khi đã đối soát thành công.</small>}
      </li>
    </ol>
    {exception && <p className="billing-progress-exception" role="status">{billingOrderStatusDescription(status, activatedAt, checkoutOpen)}</p>}
    {refunded && <p className="billing-progress-note">Các bước trên là lịch sử xử lý đơn. Hãy xem gói đang có hiệu lực trong Cài đặt gói để biết quyền Premium hiện tại.</p>}
    {status === "PENDING_PAYMENT" && <p className="billing-progress-note">Hạn đơn: {formatVietnamDateTime(expiresAt)}. Việc tạo đơn hoặc sao chép thông tin chuyển khoản không xác nhận đã trả tiền.</p>}
    {status === "PAID" && <p className="billing-progress-note">{billingOrderStatusDescription(status, activatedAt, checkoutOpen)}</p>}
  </section>;
}
