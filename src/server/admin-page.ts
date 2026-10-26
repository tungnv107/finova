import { forbidden, notFound } from "next/navigation";
import type { SystemRole } from "@finova/prisma";
import { HttpError } from "@/server/context";
import { requireSystemRole } from "@/server/system-auth";

/** Deny unauthorised access before any admin data is read or rendered. */
export async function requireAdminPageRole(roles: readonly SystemRole[]) {
  try { return await requireSystemRole(roles); }
  catch (error) {
    if (error instanceof HttpError) {
      if (error.status === 403) forbidden();
      if (error.status === 401 || error.status === 503) notFound();
    }
    throw error;
  }
}
