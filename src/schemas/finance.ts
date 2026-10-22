import { z } from "zod";

const amount = z.string().regex(/^[1-9]\d{0,15}$/, "Nhập số tiền VND nguyên, lớn hơn 0.");
const zeroAmount = z.string().regex(/^(0|[1-9]\d{0,15})$/);
const transactionTags = z.array(z.string().trim().min(1).max(30)
  .regex(/^[^,\r\n]+$/, "Thẻ không được chứa dấu phẩy hoặc xuống dòng.")).max(10)
  .refine(tags => new Set(tags.map(tag => tag.toLocaleLowerCase("vi"))).size === tags.length,
    "Không được nhập thẻ trùng nhau.");

export const walletInput = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum(["CASH", "BANK", "EWALLET", "SAVINGS"]),
  openingBalance: zeroAmount,
  openingDate: z.iso.datetime({ offset: true }),
  note: z.string().max(500).optional(),
});

export const transactionInput = z.object({
  kind: z.enum(["INCOME", "EXPENSE", "TRANSFER"]),
  walletId: z.string().min(1),
  destinationWalletId: z.string().optional(),
  categoryId: z.string().optional(),
  amount,
  feeAmount: zeroAmount.optional(),
  occurredAt: z.iso.datetime({ offset: true }),
  note: z.string().max(1000).optional(),
  tags: transactionTags.optional(),
}).superRefine((value, ctx) => {
  if (value.kind !== "TRANSFER" && value.feeAmount !== undefined && value.feeAmount !== "0") {
    ctx.addIssue({ code: "custom", path: ["feeAmount"], message: "Chỉ giao dịch chuyển ví mới có phí chuyển tiền." });
  }
});

export const transactionEdit = transactionInput.safeExtend({ version: z.number().int().positive() });
export const refundInput = z.object({ amount, note: z.string().max(1000).optional() });
export const walletEdit = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  archived: z.boolean().optional(),
  includeInAvailable: z.boolean().optional(),
});

export const walletReconciliationInput = z.object({
  actualBalance: zeroAmount,
  expectedBalance: z.string().regex(/^-?(0|[1-9]\d{0,15})$/),
  reason: z.string().trim().min(5).max(500),
  idempotencyKey: z.uuid(),
});
