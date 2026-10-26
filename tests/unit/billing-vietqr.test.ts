import { describe, expect, it } from "vitest";
import { vietQrImageUrl } from "@/modules/billing/vietqr";

const order = {
  bankCode: "VCB", accountNumber: "012345678901", accountName: "FINOVA VIET NAM",
  amountVnd: 29000, transferReference: "FNV0123456789ABCDEF0123",
};

describe("VietQR checkout instructions", () => {
  it("uses the persisted receiver and order snapshot without keys or callback URL", () => {
    const result = vietQrImageUrl(order);
    expect(result).not.toBeNull();
    const url = new URL(result!);
    expect(url.origin).toBe("https://img.vietqr.io");
    expect(url.pathname).toBe("/image/VCB-012345678901-qr_only.png");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      amount: "29000", addInfo: order.transferReference, accountName: order.accountName,
    });
    expect(result).not.toMatch(/(?:secret|token|api[_-]?key|callback)=/i);
  });

  it("binds yearly price and URL-encodes the account holder", () => {
    const result = vietQrImageUrl({ ...order, amountVnd: 199000, accountName: "Công ty Finova Việt Nam" });
    expect(new URL(result!).searchParams.get("amount")).toBe("199000");
    expect(new URL(result!).searchParams.get("accountName")).toBe("Công ty Finova Việt Nam");
  });

  it.each([
    { bankCode: "BAD/../../foo" }, { accountNumber: "12?evil" },
    { amountVnd: -1 }, { amountVnd: NaN }, { amountVnd: 29000.5 },
    { transferReference: "UNTRUSTED" }, { accountName: "" },
  ])("refuses invalid QR input %o", changed => {
    expect(vietQrImageUrl({ ...order, ...changed })).toBeNull();
  });
});
