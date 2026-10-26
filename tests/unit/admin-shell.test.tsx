import { describe, expect, it, beforeEach, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HttpError } from "../../src/server/context";

const { pathname, requireSystemRole, forbidden, notFound } = vi.hoisted(() => ({
  pathname: vi.fn(), requireSystemRole: vi.fn(),
  forbidden: vi.fn(() => { throw new Error("FORBIDDEN_INTERRUPT"); }),
  notFound: vi.fn(() => { throw new Error("NOT_FOUND_INTERRUPT"); }),
}));
vi.mock("next/navigation", () => ({ usePathname: pathname, forbidden, notFound }));
vi.mock("../../src/server/system-auth", () => ({ requireSystemRole }));

import { AdminNavigation, isAdminNavActive } from "../../src/components/admin-navigation";
import { requireAdminPageRole } from "../../src/server/admin-page";

beforeEach(() => {
  vi.clearAllMocks();
  pathname.mockReturnValue("/admin/users/user-123");
  requireSystemRole.mockResolvedValue({ userId: "system-admin", role: "ADMIN" });
});

describe("admin protected shell", () => {
  it("marks only the current section as active, including direct detail URLs", () => {
    expect(isAdminNavActive("/admin/users/user-123", "/admin/users")).toBe(true);
    expect(isAdminNavActive("/admin/users/user-123", "/admin")).toBe(false);
    expect(isAdminNavActive("/admin/billing/prices", "/admin/billing/payments")).toBe(false);
    const html = renderToStaticMarkup(createElement(AdminNavigation, {
      userManager: true, analyticsAccess: true, billingAccess: true,
    }));
    expect(html).toMatch(/aria-current="page" href="\/admin\/users"/);
    expect(html).not.toMatch(/aria-current="page" href="\/admin"/);
    expect(html).toContain("Điều hướng quản trị");
    expect(html).toContain("Về tài khoản cá nhân");
  });

  it("hides privileged navigation from reporting roles", () => {
    const analyst = renderToStaticMarkup(createElement(AdminNavigation, {
      userManager: false, analyticsAccess: true, billingAccess: false,
    }));
    expect(analyst).toContain("Thống kê truy cập");
    expect(analyst).not.toContain("Người dùng");
    expect(analyst).not.toContain("Đối soát thanh toán");
    const finance = renderToStaticMarkup(createElement(AdminNavigation, {
      userManager: false, analyticsAccess: false, billingAccess: true,
    }));
    expect(finance).toContain("Đối soát thanh toán");
    expect(finance).not.toContain("Thống kê truy cập");
    expect(finance).not.toContain("Bảng giá");
  });

  it("uses HTTP 403 interrupt for non-admin direct page access before returning an actor", async () => {
    requireSystemRole.mockRejectedValue(new HttpError(403, "SYSTEM_ROLE_REQUIRED", "Denied"));
    await expect(requireAdminPageRole(["SUPER_ADMIN", "ADMIN"])).rejects.toThrow("FORBIDDEN_INTERRUPT");
    expect(forbidden).toHaveBeenCalledOnce();
    expect(notFound).not.toHaveBeenCalled();
  });

  it("keeps disabled or unauthenticated admin pages undiscoverable", async () => {
    for (const status of [401, 503]) {
      requireSystemRole.mockRejectedValueOnce(new HttpError(status, "UNAVAILABLE", "Unavailable"));
      await expect(requireAdminPageRole(["ADMIN"])).rejects.toThrow("NOT_FOUND_INTERRUPT");
    }
    expect(notFound).toHaveBeenCalledTimes(2);
    expect(forbidden).not.toHaveBeenCalled();
  });
});
