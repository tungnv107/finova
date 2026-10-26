import { describe, expect, it } from "vitest";
import { createPageviewTracker, usageGroupFromPath, vietnamUsageDay } from "../../src/modules/admin/usage-domain";

describe("privacy-safe usage taxonomy and Vietnam calendar", () => {
  it("tracks only predefined route categories, omitting user/order IDs and query parameters", () => {
    expect(usageGroupFromPath("/dashboard")).toBe("DASHBOARD");
    expect(usageGroupFromPath("/bank-sync/connections/secret123")).toBe("BANK_SYNC");
    expect(usageGroupFromPath("/billing/checkout/private-id?amount=123")).toBe("BILLING");
    expect(usageGroupFromPath("/admin/users/secret123")).toBeNull();
    expect(usageGroupFromPath("/api/v1/wallets")).toBeNull();
  });
  it("rolls over at midnight Vietnam local time, independent of UTC date", () => {
    expect(vietnamUsageDay(new Date("2026-10-23T16:59:59Z")).toISOString()).toBe("2026-10-23T00:00:00.000Z");
    expect(vietnamUsageDay(new Date("2026-10-23T17:00:00Z")).toISOString()).toBe("2026-10-24T00:00:00.000Z");
  });

  it("counts only transitions, not duplicate effects or StrictMode component remounts", () => {
    let sequence = 0;
    const navigate = createPageviewTracker(() => `navigation-${++sequence}`);
    const first = navigate("/reports");
    expect(first).toEqual({ navigationId: "navigation-1", routeGroup: "REPORTS" });
    expect(navigate("/reports")).toBeNull();
    expect(navigate("/wallets/secret-wallet")).toEqual({ navigationId: "navigation-2", routeGroup: "WALLETS" });
    // Browser back creates a new pageview even for an already visited path.
    expect(navigate("/reports")).toEqual({ navigationId: "navigation-3", routeGroup: "REPORTS" });
    expect(navigate("/reports")).toBeNull();
    expect(sequence).toBe(3);
  });

  it("resets on browser reload and counts a return from an excluded route", () => {
    const documentOne = createPageviewTracker(() => "first-document-id");
    expect(documentOne("/settings")).not.toBeNull();
    expect(documentOne("/admin/users/secret-id")).toBeNull();
    expect(documentOne("/settings")).toEqual({ navigationId: "first-document-id", routeGroup: "SETTINGS" });
    const reloadedDocument = createPageviewTracker(() => "reloaded-document-id");
    expect(reloadedDocument("/settings")).toEqual({ navigationId: "reloaded-document-id", routeGroup: "SETTINGS" });
  });
});
