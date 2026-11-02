import { describe, expect, it, vi } from "vitest";
import { localDateTimeInput, vietnamDateTime } from "@/lib/dates";
import { failure } from "@/server/http";

describe("Vietnam transaction timestamps", () => {
  it("preserves the Vietnam day across UTC midnight and round trips minutes", () => {
    expect(localDateTimeInput(new Date("2026-10-31T17:30:00Z"))).toBe("2026-11-01T00:30");
    expect(vietnamDateTime("2026-11-01T00:30").toISOString()).toBe("2026-10-31T17:30:00.000Z");
  });
  it.each(["2026-02-30T10:00", "2026-10-31T24:00", "2026-10-31T12:60", "2026-10-31T12:00Z"])("rejects normalized or malformed time %s", value => {
    expect(() => vietnamDateTime(value)).toThrow();
  });
});

describe("private API errors", () => {
  it("correlates errors without sending or logging raw database/provider messages", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = failure(new Error("Prisma SQL: account=private-user token=secret note=salary-10000000"));
      const payload = await response.json();
      expect(response.status).toBe(500);
      expect(payload.error.requestId).toMatch(/^[a-f0-9-]{36}$/);
      expect(JSON.stringify(payload)).not.toContain("private-user");
      expect(JSON.stringify(spy.mock.calls)).not.toMatch(/secret|salary|private-user/);
      expect(spy).toHaveBeenCalledWith("Unhandled API error", { requestId: payload.error.requestId, category: "unexpected" });
    } finally { spy.mockRestore(); }
  });
});
