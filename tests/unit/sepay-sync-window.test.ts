import { describe, expect, it } from "vitest";
import { sepaySyncWindow } from "@/modules/bank-sync/sepay/service";

describe("SePay scheduled sync overlap", () => {
  it("uses Vietnam calendar dates around UTC midnight and adds a two-day overlap", () => {
    const now = new Date("2026-10-22T18:00:00Z"); // 01:00 ICT, Oct 23
    const lastSynced = new Date("2026-10-21T20:00:00Z");
    expect(sepaySyncWindow(lastSynced, now)).toEqual({ from: "2026-10-20", to: "2026-10-23" });
  });

  it("limits long disconnected accounts to the most recent seven days", () => {
    const now = new Date("2026-10-22T02:00:00Z");
    expect(sepaySyncWindow(new Date("2025-01-01T00:00:00Z"), now)).toEqual({ from: "2026-10-15", to: "2026-10-22" });
  });
});
