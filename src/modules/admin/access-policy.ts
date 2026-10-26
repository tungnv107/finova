import type { SystemRole } from "@finova/prisma";
import { HttpError } from "@/server/context";

/** Protect privileged accounts from routine suspension or accidental last-admin lockout. */
export function assertAccessChangeAllowed(actor: { userId: string; role: SystemRole }, targetId: string, targetRoles: readonly string[]) {
  if (actor.userId === targetId) throw new HttpError(403, "SELF_ACCESS_CHANGE", "Không thể tự khóa/mở tài khoản quản trị.");
  if (targetRoles.includes("SUPER_ADMIN")) throw new HttpError(403, "PROTECTED_ADMIN", "Không thể thay đổi trạng thái Super Admin tại đây.");
  if (actor.role !== "SUPER_ADMIN" && targetRoles.includes("ADMIN")) {
    throw new HttpError(403, "PROTECTED_ADMIN", "Chỉ Super Admin có thể thay đổi trạng thái Admin.");
  }
}
