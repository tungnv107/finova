import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { bankEnvelope, type BankEnvelope } from "../domain";
import { historyRowSchema, type SePayHistoryRow } from "./client";

const ipnSchema = z.object({
  gateway: z.string(), transaction_date: z.string(), bank_account_xid: z.string().min(1), account_number: z.string(),
  content: z.string(), transfer_type: z.enum(["credit", "debit"]), amount: z.number().int().positive().safe(),
  reference_code: z.string().nullish(), transaction_id: z.string().min(1),
});

export function verifySePayIpnAuthorization(value: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 24 || !value?.startsWith("Apikey ")) return false;
  const supplied = Buffer.from(value.slice(7), "utf8");
  const expected = Buffer.from(secret, "utf8");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

/** Bank Hub's timezone-less transaction_date uses Vietnam local time. Invalid input fails closed. */
export function sepayDateToIso(value: string) {
  const valueWithOffset = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(" ", "T")}+07:00` : value;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(valueWithOffset) ||
      !Number.isFinite(Date.parse(valueWithOffset))) throw new Error("Invalid SePay transaction_date");
  return valueWithOffset;
}

function mapSingle(row: { transaction_id: string; transaction_date: string; bank_account_xid: string;
  transfer_type: "credit" | "debit"; amount: number; content: string; reference: string | null | undefined },
  origin: "history" | "ipn"): BankEnvelope {
  // Transaction IDs may overlap across linked banks. Raw event uniqueness is
  // connection-scoped, so include the bank account in the event identifier.
  return bankEnvelope.parse({ eventId: `${origin}:${row.bank_account_xid}:${row.transaction_id}`, accountRef: row.bank_account_xid,
    transactions: [{ externalTransactionId: row.transaction_id, bankReference: row.reference ?? null,
      amount: String(row.amount), currency: "VND", direction: row.transfer_type === "credit" ? "IN" : "OUT",
      occurredAt: sepayDateToIso(row.transaction_date), bookedAt: sepayDateToIso(row.transaction_date),
      bookingStatus: "BOOKED", descriptionRaw: row.content, sourceVersion: "sepay-bankhub-v1" }] });
}

export function mapSePayHistory(raw: SePayHistoryRow) {
  const row = historyRowSchema.parse(raw);
  return mapSingle({ ...row, content: row.transaction_content, reference: row.reference_number }, "history");
}

export function parseSePayIpn(raw: Uint8Array) {
  const decoded = ipnSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)));
  return mapSingle({ ...decoded, reference: decoded.reference_code }, "ipn");
}
