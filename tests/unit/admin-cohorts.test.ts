import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ count: vi.fn(), query: vi.fn() }));
vi.mock("../../src/lib/db", () => ({ prisma: { user: { count: mocks.count }, $queryRaw: mocks.query } }));

import { getRegistrationCohorts } from "../../src/modules/admin/cohorts";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.count.mockResolvedValue(100);
  mocks.query.mockResolvedValue([]);
});

describe("signup cohorts and retention", () => {
  it("calculates mature D1/D7/D30 retention with real denominator windows and empty days", async () => {
    mocks.query.mockResolvedValue([
      { cohortDay: new Date("2026-09-24"), signups: 3, activeD0: 1, activeD1: 1, activeD7: 2, activeD30: 1 },
      { cohortDay: new Date("2026-10-17"), signups: 4, activeD0: 2, activeD1: 2, activeD7: 1, activeD30: 0 },
      { cohortDay: new Date("2026-10-23"), signups: 2, activeD0: 1, activeD1: 1, activeD7: 0, activeD30: 0 },
      { cohortDay: new Date("2026-10-24"), signups: 1, activeD0: 1, activeD1: 0, activeD7: 0, activeD30: 0 },
    ]);
    const result = await getRegistrationCohorts(new Date("2026-10-24T16:59:59.999Z"));
    expect(result.totalUsers).toBe(100);
    expect(result.newUsers30d).toBe(7);
    expect(result.activatedOnSignup).toBe(5);
    expect(result.day1).toEqual({ users: 9, returned: 4, rate: 4 / 9 });
    expect(result.day7).toEqual({ users: 7, returned: 3, rate: 3 / 7 });
    expect(result.day30).toEqual({ users: 3, returned: 1, rate: 1 / 3 });
    expect(result.cohorts).toHaveLength(90);
    expect(result.cohorts.at(-1)).toMatchObject({ day: "2026-10-24", activeD1: null, activeD7: null, activeD30: null });
    expect(result.cohorts.at(-2)).toMatchObject({ day: "2026-10-23", activeD1: 1, activeD7: null });
    expect(result.cohorts.find(row => row.day === "2026-10-01")?.signups).toBe(0);
    const dateParams = mocks.query.mock.calls[0].slice(1) as Date[];
    expect(dateParams.map(day => day.toISOString())).toEqual([
      "2026-07-26T17:00:00.000Z", "2026-10-24T17:00:00.000Z",
    ]);
  });

  it("changes cohort day precisely at Vietnam midnight and handles an empty reporting period", async () => {
    const before = await getRegistrationCohorts(new Date("2026-10-24T16:59:59.999Z"));
    const after = await getRegistrationCohorts(new Date("2026-10-24T17:00:00.000Z"));
    expect(before.cohorts.at(-1)?.day).toBe("2026-10-24");
    expect(after.cohorts.at(-1)?.day).toBe("2026-10-25");
    expect(after.newUsers30d).toBe(0);
    expect(after.day1).toEqual({ users: 0, returned: 0, rate: null });
    expect(after.day7.rate).toBeNull();
    expect(after.day30.rate).toBeNull();
  });
});
