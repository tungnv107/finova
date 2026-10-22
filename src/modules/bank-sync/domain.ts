import { createHash, createHmac, timingSafeEqual, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";

export const bankRow = z.object({
  externalTransactionId: z.string().trim().min(1).max(200).nullish(),
  bankReference: z.string().trim().max(200).nullish(),
  amount: z.string().regex(/^[1-9]\d{0,15}$/, "VND phải là số nguyên dương."),
  currency: z.literal("VND"),
  direction: z.enum(["IN", "OUT"]),
  occurredAt: z.iso.datetime({ offset: true }),
  bookedAt: z.iso.datetime({ offset: true }).nullish(),
  bookingStatus: z.enum(["PENDING", "BOOKED", "REVERSED", "UNKNOWN"]),
  descriptionRaw: z.string().max(1000),
  runningBalance: z.string().regex(/^-?(0|[1-9]\d{0,15})$/).nullish(),
  sourceVersion: z.string().min(1).max(30).default("1"),
}).strict();

export const bankEnvelope = z.object({
  eventId: z.string().trim().min(1).max(200),
  accountRef: z.string().trim().min(1).max(200),
  transactions: z.array(bankRow).min(1).max(100),
}).strict();

export type BankEnvelope = z.infer<typeof bankEnvelope>;

/** Never let a late pending delivery undo a finalized bank status. */
export function bankBookingTransition(previous: z.infer<typeof bankRow>["bookingStatus"], incoming: z.infer<typeof bankRow>["bookingStatus"]) {
  if (previous === incoming) return "UNCHANGED" as const;
  if (previous === "REVERSED") return "CONFLICT" as const;
  if (incoming === "REVERSED") return "REVERSED" as const;
  if ((previous === "PENDING" || previous === "UNKNOWN") && incoming === "BOOKED") return "BOOKED" as const;
  if (previous === "UNKNOWN" && incoming === "PENDING") return "PENDING" as const;
  if (previous === "BOOKED") return "STALE" as const;
  return "CONFLICT" as const;
}

export function digest(input: string | Uint8Array) {
  return createHash("sha256").update(input).digest("hex");
}

export const providerCapabilities = {
  SANDBOX: { accountList: false, transactionHistory: false, balance: false, webhook: true, tokenRefresh: false, personalAccounts: false },
  STATEMENT_IMPORT: { accountList: false, transactionHistory: false, balance: false, webhook: false, tokenRefresh: false, personalAccounts: false },
  SEPAY_BANKHUB: { accountList: true, transactionHistory: true, balance: false, webhook: true, tokenRefresh: true, personalAccounts: true },
} as const;

/** Entirely synthetic signed protocol for local testing. Never accept in production. */
export function verifySandboxSignature(raw: Uint8Array, timestamp: string | null, signature: string | null, secret: string | undefined, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!secret || secret.length < 32 || !timestamp || !/^\d{10}$/.test(timestamp) ||
    Math.abs(nowSeconds - Number(timestamp)) > 300 || !signature || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(timestamp).update("\n").update(raw).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}

function encryptionKey() {
  const key = Buffer.from(process.env.FINOVA_BANK_EVENT_KEY ?? "", "base64");
  if (key.length !== 32) throw new Error("FINOVA_BANK_EVENT_KEY must be a 32-byte base64 key.");
  return key;
}

export function sealBankEvent(raw: Uint8Array) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(raw), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

export function openBankEvent(encoded: string) {
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length < 29) throw new Error("Malformed encrypted bank event.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]);
}

export function bankFingerprint(accountId: string, row: z.infer<typeof bankRow>) {
  return digest(JSON.stringify([accountId, row.direction, row.amount, row.currency, row.occurredAt, row.bankReference, row.descriptionRaw]));
}

export function isSandboxEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.FINOVA_BANK_SANDBOX_ENABLED === "1";
}
