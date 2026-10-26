import { describe, expect, it } from "vitest";
import { billingOutboxMaxAttempts, billingOutboxRetryDelayMs } from "../../src/modules/billing/outbox";

describe("durable billing notification delivery", () => {
  it("uses exponential retry and a bounded dead letter threshold", () => {
    expect(billingOutboxMaxAttempts).toBe(6);
    expect([1, 2, 3, 4, 5, 6].map(billingOutboxRetryDelayMs)).toEqual([
      15_000, 30_000, 60_000, 120_000, 240_000, 480_000,
    ]);
    expect(billingOutboxRetryDelayMs(100)).toBe(30 * 60_000);
  });
});
