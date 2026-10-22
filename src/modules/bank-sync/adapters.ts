import { createHmac } from "node:crypto";
import { z } from "zod";
import { bankEnvelope, providerCapabilities, verifySandboxSignature, type BankEnvelope } from "./domain";

export type BankProviderCode = keyof typeof providerCapabilities;
export type BankProviderCapabilities = (typeof providerCapabilities)[BankProviderCode];

/** Provider adapters are explicit allowlists. A production connector must be verified separately. */
export interface BankProviderAdapter {
  readonly code: BankProviderCode;
  readonly capabilities: BankProviderCapabilities;
  readonly transport: "SIGNED_WEBHOOK" | "USER_FILE" | "REST_AND_IPN";
  verifyWebhook?(raw: Uint8Array, headers: Headers, secret: string | undefined, nowSeconds?: number): boolean;
  parseWebhook?(raw: Uint8Array): BankEnvelope;
}

function parseSyntheticWebhook(raw: Uint8Array): BankEnvelope {
  return bankEnvelope.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)));
}

export const bankProviderAdapters = {
  SANDBOX: {
    code: "SANDBOX",
    capabilities: providerCapabilities.SANDBOX,
    transport: "SIGNED_WEBHOOK",
    verifyWebhook: (raw: Uint8Array, headers: Headers, secret: string | undefined, nowSeconds?: number) =>
      verifySandboxSignature(raw, headers.get("x-finova-timestamp"), headers.get("x-finova-signature"), secret, nowSeconds),
    parseWebhook: parseSyntheticWebhook,
  },
  STATEMENT_IMPORT: {
    code: "STATEMENT_IMPORT",
    capabilities: providerCapabilities.STATEMENT_IMPORT,
    transport: "USER_FILE",
  },
  SEPAY_BANKHUB: {
    code: "SEPAY_BANKHUB",
    capabilities: providerCapabilities.SEPAY_BANKHUB,
    transport: "REST_AND_IPN",
  },
} as const satisfies Record<BankProviderCode, BankProviderAdapter>;

/** Deterministic signed fixture for tests; never use to impersonate a real bank. */
export function syntheticWebhookFixture(envelope: z.input<typeof bankEnvelope>, secret: string, timestamp: number) {
  const raw = Buffer.from(JSON.stringify(bankEnvelope.parse(envelope)), "utf8");
  const time = String(timestamp);
  const signature = createHmac("sha256", secret).update(time).update("\n").update(raw).digest("hex");
  return { raw, headers: new Headers({ "content-type": "application/json", "x-finova-timestamp": time,
    "x-finova-signature": signature }) };
}
