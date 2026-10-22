import { describe, expect, it } from "vitest";
import { estimatedStatementRemaining } from "@/lib/card-statements";

const close = new Date("2026-09-20T16:59:59.999Z");

describe("Ước tính số dư sao kê chưa thanh toán", () => {
  it("trừ thanh toán và hoàn tiền của giao dịch thuộc sao kê đã chốt", () => {
    expect(estimatedStatementRemaining("1000000", close, [
      { kind: "PAYMENT", amount: "300000" },
      { kind: "REFUND", amount: "200000", originalPurchaseDate: new Date("2026-09-12T17:00:00Z") },
    ])).toBe("500000");
  });
  it("không dùng hoàn tiền của giao dịch kỳ mới để giảm nợ sao kê cũ", () => {
    expect(estimatedStatementRemaining("1000000", close, [
      { kind: "PURCHASE", amount: "400000" },
      { kind: "REFUND", amount: "150000", originalPurchaseDate: new Date("2026-09-25T17:00:00Z") },
      { kind: "PAYMENT", amount: "100000" },
    ])).toBe("900000");
  });
  it("không âm khi trả dư và khi không có sao kê", () => {
    expect(estimatedStatementRemaining("100000", close, [{ kind: "PAYMENT", amount: "200000" }])).toBe("0");
    expect(estimatedStatementRemaining("0", close, [])).toBe("0");
  });
});
