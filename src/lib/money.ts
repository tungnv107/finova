import Decimal from "decimal.js";

Decimal.set({ precision: 32, rounding: Decimal.ROUND_HALF_UP });
export { Decimal };

export function parseVnd(raw: string, allowZero = false): Decimal {
  if (typeof raw !== "string" || !/^(0|[1-9]\d{0,15})$/.test(raw)) {
    throw new Error("Số tiền VND phải là số nguyên không âm dưới 10¹⁶.");
  }
  const value = new Decimal(raw);
  if (!allowZero && value.isZero()) throw new Error("Số tiền phải lớn hơn 0.");
  return value;
}

export function money(value: Decimal.Value): string {
  return new Decimal(value).toFixed(0);
}

export function formatVnd(value: string): string {
  const negative = value.startsWith("-");
  const digits = (negative ? value.slice(1) : value).split(".")[0];
  return `${negative ? "−" : ""}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".")} ₫`;
}

export function normalAmount(kind: "ASSET" | "LIABILITY" | "INCOME" | "EXPENSE" | "EQUITY" | "RECEIVABLE", side: "DEBIT" | "CREDIT", amount: Decimal.Value) {
  const debitNormal = kind === "ASSET" || kind === "EXPENSE" || kind === "RECEIVABLE";
  return new Decimal(amount).mul((side === "DEBIT") === debitNormal ? 1 : -1);
}
