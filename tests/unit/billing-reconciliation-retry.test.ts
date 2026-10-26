import { describe, expect, it } from "vitest";
import { billingMaxReconcileAttempts, billingReconcileRetryDelayMs } from "../../src/modules/billing/reconciliation";

describe("durable billing retry policy", () => {
  it("uses bounded exponential retry delays and a finite dead-letter threshold", () => {
    expect(billingMaxReconcileAttempts).toBe(6);
    expect([1, 2, 3, 4, 5, 6].map(billingReconcileRetryDelayMs)).toEqual([
      15_000, 30_000, 60_000, 120_000, 240_000, 480_000,
    ]);
    expect(billingReconcileRetryDelayMs(100)).toBe(30 * 60_000);
  });
});
