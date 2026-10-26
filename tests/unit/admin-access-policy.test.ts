import { describe, expect, it } from "vitest";
import { assertAccessChangeAllowed } from "@/modules/admin/access-policy";

describe("admin access policy", () => {
  const admin = { userId: "admin1", role: "ADMIN" as const };
  const superAdmin = { userId: "root", role: "SUPER_ADMIN" as const };

  it("permits Admin to suspend ordinary users", () => {
    expect(() => assertAccessChangeAllowed(admin, "user1", [])).not.toThrow();
  });
  it("prevents an admin from suspending themselves", () => {
    expect(() => assertAccessChangeAllowed(admin, "admin1", ["ADMIN"]))
      .toThrowError(expect.objectContaining({ code: "SELF_ACCESS_CHANGE", status: 403 }));
  });
  it("prevents Admin from suspending another Admin", () => {
    expect(() => assertAccessChangeAllowed(admin, "admin2", ["ADMIN"]))
      .toThrowError(expect.objectContaining({ code: "PROTECTED_ADMIN", status: 403 }));
  });
  it("permits Super Admin to suspend another Admin", () => {
    expect(() => assertAccessChangeAllowed(superAdmin, "admin2", ["ADMIN"])) .not.toThrow();
  });
  it("protects every Super Admin, including the last one", () => {
    expect(() => assertAccessChangeAllowed(superAdmin, "root2", ["SUPER_ADMIN"]))
      .toThrowError(expect.objectContaining({ code: "PROTECTED_ADMIN", status: 403 }));
  });
});
