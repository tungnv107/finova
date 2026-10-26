import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ role: vi.fn(), enabled: vi.fn(), usage: vi.fn(), cohorts: vi.fn() }));
vi.mock("../../src/server/admin-page", () => ({ requireAdminPageRole: mocks.role }));
vi.mock("../../src/modules/admin/usage", () => ({ getUsageKpis: mocks.usage, usageAnalyticsEnabled: mocks.enabled }));
vi.mock("../../src/modules/admin/cohorts", () => ({ getRegistrationCohorts: mocks.cohorts }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) =>
  createElement("a", { href }, children) }));

import AdminAnalyticsPage from "../../src/app/(protected)/admin/analytics/page";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.role.mockResolvedValue({ role: "ANALYST" });
  mocks.enabled.mockReturnValue(true);
  mocks.usage.mockResolvedValue({ dau: 2, wau: 3, mau: 4,
    pageViews7d: 5, pageViews30d: 5, pageViews90d: 5,
    trends: Array.from({ length: 90 }, (_, i) => ({
      day: new Date(Date.UTC(2026, 6, 28 + i)).toISOString().slice(0, 10), activeUsers: i === 89 ? 2 : 0,
      pageViews: i === 89 ? 5 : 0,
    })),
  });
  mocks.cohorts.mockResolvedValue({ totalUsers: 10, newUsers30d: 3,
    day1: { users: 4, returned: 2, rate: 0.5 },
    day7: { users: 3, returned: 1, rate: 1 / 3 },
    day30: { users: 0, returned: 0, rate: null },
    cohorts: Array.from({ length: 90 }, (_, i) => ({
      day: new Date(Date.UTC(2026, 6, 28 + i)).toISOString().slice(0, 10),
      signups: i === 89 ? 3 : 0, activeD0: 0,
      activeD1: i === 89 ? null : 0, activeD7: i >= 83 ? null : 0, activeD30: i >= 60 ? null : 0,
    })),
  });
});

describe("admin signup cohort view", () => {
  it("guards role before reading aggregates and renders mature retention without user identifiers", async () => {
    const markup = renderToStaticMarkup(await AdminAnalyticsPage({ searchParams: Promise.resolve({ days: "30" }) }));
    expect(mocks.role).toHaveBeenCalledWith(["SUPER_ADMIN", "ADMIN", "ANALYST"]);
    expect(markup).toContain("Cohort và tỷ lệ quay lại");
    expect(markup).toContain("50.0%");
    expect(markup).toContain("TÀI KHOẢN ĐÃ ĐĂNG KÝ");
    expect(markup).toContain("D30");
    expect(markup).not.toContain("userId");
    expect(markup).not.toContain("bankAccountNumber");
    mocks.role.mockRejectedValueOnce(new Error("FORBIDDEN"));
    mocks.usage.mockClear(); mocks.cohorts.mockClear();
    await expect(AdminAnalyticsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("FORBIDDEN");
    expect(mocks.usage).not.toHaveBeenCalled();
    expect(mocks.cohorts).not.toHaveBeenCalled();
  });

  it("does not query cohorts when analytics collection is disabled", async () => {
    mocks.enabled.mockReturnValue(false);
    const markup = renderToStaticMarkup(await AdminAnalyticsPage({ searchParams: Promise.resolve({}) }));
    expect(markup).toContain("chưa bật đo lường");
    expect(mocks.usage).not.toHaveBeenCalled();
    expect(mocks.cohorts).not.toHaveBeenCalled();
  });
});
