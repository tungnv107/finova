/**
 * VietQR public Quick Link (https://www.vietqr.io/qr-dong).
 * Input must come from a persisted billing order and its approved receiver.
 * The link contains transfer instructions only; it never proves settlement.
 */
export function vietQrImageUrl(input: {
  bankCode: string;
  accountNumber: string;
  accountName: string;
  amountVnd: number;
  transferReference: string;
}): string | null {
  const bankCode = input.bankCode.trim().toUpperCase();
  const accountNumber = input.accountNumber.trim();
  const accountName = input.accountName.trim();
  const transferReference = input.transferReference.trim();
  if (!/^(?:[A-Z0-9]{2,16}|\d{6})$/.test(bankCode) ||
      !/^\d{6,19}$/.test(accountNumber) ||
      !accountName || accountName.length > 120 ||
      !/^FNV[A-F0-9]{20}$/.test(transferReference) ||
      !Number.isSafeInteger(input.amountVnd) ||
      input.amountVnd <= 0 || input.amountVnd > 9999999999999) return null;

  const url = new URL(`https://img.vietqr.io/image/${bankCode}-${accountNumber}-qr_only.png`);
  url.searchParams.set("amount", String(input.amountVnd));
  url.searchParams.set("addInfo", transferReference);
  url.searchParams.set("accountName", accountName);
  return url.toString();
}
