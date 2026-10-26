import { describe, expect, it } from "vitest";
import { sanitizeOperatorReason } from "../../src/modules/admin/privacy";

describe("admin operational/audit reason privacy", () => {
  it("preserves useful ordinary audit reasons", () => {
    const reason = "Hoàn phí thử nghiệm do giao dịch ngân hàng không khớp";
    expect(sanitizeOperatorReason(`  ${reason}  `)).toBe(reason);
  });

  it.each([
    "token=syntheticSecretValue123",
    "password: syntheticSecretValue123",
    "api_key=syntheticSecretValue123",
    "apiKey: syntheticSecretValue123",
    "client_secret='syntheticSecretValue123'",
    "refresh_token=syntheticSecretValue123",
    "access-token=syntheticSecretValue123",
    "Authorization: Bearer syntheticSecretValue123",
    "Authorization: Basic syntheticSecretValue123",
    '"api_key": "syntheticSecretValue123"',
    '{"refresh_token":"syntheticSecretValue123"}',
    "?access_token=syntheticSecretValue123&retry=true",
    "private_key='syntheticSecretValue123'",
    "authorization=syntheticSecretValue123",
  ])("redacts operator-inserted credentials: %s", value => {
    const output = sanitizeOperatorReason(`Investigate transaction ${value}, safely retry`);
    expect(output).not.toContain("syntheticSecretValue123");
    expect(output).toContain("[REDACTED]");
    expect(output).toContain("safely retry");
  });

  it("redacts long bank account numbers without stripping timestamps or descriptive text", () => {
    expect(sanitizeOperatorReason("Check receiving account 12345678901 on 24/10/2026"))
      .toBe("Check receiving account [REDACTED_ACCOUNT] on 24/10/2026");
    expect(sanitizeOperatorReason("Receiver accountNumber=1234567 changed"))
      .toBe("Receiver accountNumber=[REDACTED] changed");
  });

  it("redacts secrets and account numbers in the same audit reason", () => {
    const output = sanitizeOperatorReason('Case 123456789012: {"token":"syntheticSecretValue123"}; account_number=9876543210');
    expect(output).not.toContain("syntheticSecretValue123");
    expect(output).not.toContain("123456789012");
    expect(output).not.toContain("9876543210");
    expect(output).toContain("Case [REDACTED_ACCOUNT]");
  });
});
