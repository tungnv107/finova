import { INITIAL_PRICES } from "./domain";

export type PublishedPrice = {
  id: string | null;
  productCode: string;
  billingPeriod: string;
  periodCount: number;
  priceVnd: number;
  currency: string;
  available: boolean;
};

/** Two visible periods; checkout is disabled for any unavailable or invalid catalog row. */
export function premiumPeriodOptions(prices: ReadonlyArray<PublishedPrice>) {
  return INITIAL_PRICES.map(defaultPrice => {
    const match = prices.find(price =>
      price.productCode === defaultPrice.productCode &&
      price.billingPeriod === defaultPrice.billingPeriod &&
      price.periodCount === 1 && price.currency === "VND" &&
      Number.isSafeInteger(price.priceVnd) && price.priceVnd > 0,
    );
    return {
      productCode: defaultPrice.productCode,
      billingPeriod: defaultPrice.billingPeriod,
      priceVnd: match?.priceVnd ?? defaultPrice.priceVnd,
      priceId: match?.id ?? null,
      available: Boolean(match?.id && match.available),
    };
  });
}

export const formatVnd = (value: number) => new Intl.NumberFormat("vi-VN").format(value);

export const formatVietnamDateTime = (date: Date) => new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh", dateStyle: "long", timeStyle: "short",
}).format(date);

export function billingOrderStatusLabel(status: string, activatedAt?: Date | null) {
  switch (status) {
    case "PENDING_PAYMENT": return "Chờ thanh toán";
    case "PAID": return activatedAt ? "Premium đã kích hoạt" : "Đã nhận tiền, chờ kích hoạt";
    case "EXPIRED": return "Đã hết hạn";
    case "REVIEW": return "Cần đối soát";
    case "REFUNDED": return "Đã hoàn tiền";
    default: return "Đang xử lý / cần đối soát";
  }
}

/** Status comes from verified server-side reconciliation, never from client acknowledgement. */
export function billingOrderStatusDescription(status: string, activatedAt: Date | null, checkoutOpen: boolean) {
  switch (status) {
    case "PAID": return activatedAt
      ? "Đơn đã được đối soát và Premium đã được kích hoạt. Vui lòng xem quyền sử dụng hiện tại trong cài đặt gói."
      : "Tiền đã được xác minh; hệ thống đang xử lý kích hoạt Premium. Vui lòng kiểm tra lại trạng thái sau.";
    case "REVIEW": return "Giao dịch cần được đối soát thêm. Không chuyển tiền lần nữa cho đơn này; hãy kiểm tra lại trạng thái hoặc liên hệ hỗ trợ.";
    case "EXPIRED": return "Đơn đã hết hạn thanh toán. Vui lòng tạo đơn mới; nếu đã chuyển tiền, hãy liên hệ hỗ trợ để đối soát.";
    case "REFUNDED": return "Đơn đã được ghi nhận hoàn tiền. Vui lòng liên hệ hỗ trợ nếu thông tin này chưa khớp với ngân hàng.";
    case "PENDING_PAYMENT": return checkoutOpen
      ? "Đơn đã tạo, chưa ghi nhận giao dịch thanh toán được xác minh. Chỉ dùng thông tin chuyển khoản của đơn này."
      : "Thanh toán Premium đang tạm dừng. Vui lòng không chuyển khoản cho đến khi Finova mở lại thanh toán.";
    default: return "Đơn đang được xử lý hoặc đối soát ngoại lệ. Vui lòng không chuyển thêm tiền cho đến khi có cập nhật.";
  }
}
