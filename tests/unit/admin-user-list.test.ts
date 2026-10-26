import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../../src/server/context";

const { userCount, userFindMany, userFindUnique, grantFindFirst, auditCreate, auditFindMany } = vi.hoisted(() => ({
  userCount: vi.fn(), userFindMany: vi.fn(), userFindUnique: vi.fn(), grantFindFirst: vi.fn(),
  auditCreate: vi.fn(), auditFindMany: vi.fn(),
}));
vi.mock("../../src/lib/db", () => ({ prisma: {
  user: { count: userCount, findMany: userFindMany, findUnique: userFindUnique },
  subscriptionGrant: { findFirst: grantFindFirst },
  adminAuditLog: { create: auditCreate, findMany: auditFindMany },
} }));

import { decodeAdminUserCursor, encodeAdminUserCursor, normalizeAdminUserFilters } from "../../src/modules/admin/user-pagination";
import { exportAdminUsers, getAdminUser, listAdminUsers } from "../../src/modules/admin/users";

const date = new Date("2026-10-24T12:00:00.000Z");
const makeUser = (n: number, name = `User ${n}`) => ({ id: `user-${String(n).padStart(3, "0")}`,
  name, email: `user${n}@example.test`, createdAt: date, accessState: null, subscriptionGrants: [],
});

beforeEach(() => {
  for (const fn of [userCount, userFindMany, userFindUnique, grantFindFirst, auditCreate, auditFindMany]) fn.mockReset();
  userCount.mockResolvedValue(65);
  userFindMany.mockResolvedValue([]);
  auditCreate.mockResolvedValue({});
  auditFindMany.mockResolvedValue([]);
  grantFindFirst.mockResolvedValue(null);
});

describe("admin user pagination and PII exports", () => {
  it("roundtrips a query-bound cursor and rejects malformed/cross-filter/tampered input", () => {
    const filters = normalizeAdminUserFilters({ q: "  alice ", status: "ACTIVE" });
    const cursor = encodeAdminUserCursor(makeUser(1), "after", filters);
    expect(decodeAdminUserCursor(cursor, filters)).toMatchObject({ id: "user-001", createdAt: date, direction: "after" });
    for (const invalid of ["%%%%", "a".repeat(801),
      cursor.replace(/.$/, cursor.endsWith("A") ? "B" : "A") + "BAD"])
      expect(() => decodeAdminUserCursor(invalid, filters)).toThrow(HttpError);
    expect(() => decodeAdminUserCursor(cursor, normalizeAdminUserFilters({ q: "alice", status: "SUSPENDED" })))
      .toThrowError(/Trang danh sách/);
    expect(decodeAdminUserCursor(undefined, filters)).toBeNull();
  });

  it("uses stable keyset predicates rather than offset and exposes previous/next anchors", async () => {
    userFindMany.mockResolvedValueOnce(Array.from({ length: 31 }, (_, i) => makeUser(i)));
    const first = await listAdminUsers({ q: "user" });
    expect(first.users).toHaveLength(30);
    expect(first.previousCursor).toBeNull();
    expect(first.nextCursor).toBeTruthy();
    expect(userFindMany.mock.calls[0][0]).not.toHaveProperty("skip");
    expect(userFindMany.mock.calls[0][0].orderBy).toEqual([{ createdAt: "desc" }, { id: "asc" }]);

    userFindMany.mockResolvedValueOnce(Array.from({ length: 31 }, (_, i) => makeUser(i + 30)));
    const second = await listAdminUsers({ q: "user", cursor: first.nextCursor! });
    expect(second.users[0].id).toBe("user-030");
    expect(second.previousCursor).toBeTruthy();
    expect(second.nextCursor).toBeTruthy();
    expect(userFindMany.mock.calls[1][0].where).toMatchObject({ AND: [expect.any(Object),
      { OR: [{ createdAt: { lt: date } }, { createdAt: date, id: { gt: "user-029" } }] }] });

    userFindMany.mockResolvedValueOnce(Array.from({ length: 30 }, (_, i) => makeUser(29 - i)));
    const back = await listAdminUsers({ q: "user", cursor: second.previousCursor! });
    expect(back.users[0].id).toBe("user-000");
    expect(back.previousCursor).toBeNull();
    expect(back.nextCursor).toBeTruthy();
    expect(userFindMany.mock.calls[2][0].orderBy).toEqual([{ createdAt: "asc" }, { id: "desc" }]);
  });

  it("limits user export to Super Admin, 500 records, sanitizes spreadsheet formulas and audits without PII", async () => {
    const admin = { userId: "admin1", role: "ADMIN" as const };
    await expect(exportAdminUsers(admin, {})).rejects.toMatchObject({ status: 403 });
    expect(userFindMany).not.toHaveBeenCalled();

    const root = { userId: "root1", role: "SUPER_ADMIN" as const };
    userFindMany.mockResolvedValueOnce(Array.from({ length: 501 }, (_, i) => makeUser(i)));
    await expect(exportAdminUsers(root, {})).rejects.toMatchObject({ status: 422, code: "EXPORT_TOO_BROAD" });
    expect(auditCreate).not.toHaveBeenCalled();

    userFindMany.mockResolvedValueOnce([makeUser(1, '=HYPERLINK("evil")')]);
    const bytes = await exportAdminUsers(root, { q: " user1 " });
    const csv = new TextDecoder().decode(bytes);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("user1@example.test");
    expect(userFindMany.mock.calls.at(-1)?.[0]).toMatchObject({ take: 501 });
    const audit = auditCreate.mock.calls[0][0].data;
    expect(audit).toMatchObject({ actorId: "root1", action: "ADMIN_USERS_EXPORT", afterJson: {
      count: 1, filteredByText: true,
    } });
    expect(JSON.stringify(audit)).not.toContain("user1@example.test");
  });

  it("details project only account/billing lifecycle with no personal wallet data", async () => {
    userFindUnique.mockResolvedValue({ ...makeUser(1), updatedAt: date,
      accessState: { status: "ACTIVE", updatedAt: date }, systemRoles: [], sessions: [{ updatedAt: date }],
      usageDays: [{ lastSeenAt: new Date("2026-10-24T13:00:00.000Z") }],
      subscriptionEvents: [{ id: "e1", kind: "GRANT_ACTIVATED", createdAt: date, startsAt: date, expiresAt: date }],
      billingOrders: [{ id: "order1", orderCode: "ORD_TEST", status: "PAID", amountDueVnd: BigInt(29000),
        createdAt: date, paidAt: date }],
    });
    auditFindMany.mockResolvedValue([{ id: "access1", createdAt: date, afterJson: { status: "SUSPENDED", secret: "hidden" } }]);
    const result = await getAdminUser("user-001");
    expect(result.lastSeenAt?.toISOString()).toBe("2026-10-24T13:00:00.000Z");
    expect(result.accessEvents).toEqual([{ id: "access1", createdAt: date, status: "SUSPENDED" }]);
    expect(JSON.stringify(result)).not.toContain("hidden");
    const selected = userFindUnique.mock.calls[0][0].select;
    for (const financial of ["wallets", "transactions", "journal", "postings", "bankConnections"]) {
      expect(selected).not.toHaveProperty(financial);
    }
    expect(result.billingOrders[0].amountDueVnd).toBe(29000);
    userFindUnique.mockResolvedValueOnce(null);
    await expect(getAdminUser("missing")).rejects.toMatchObject({ status: 404 });
  });
});
