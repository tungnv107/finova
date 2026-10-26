import { HttpError } from "@/server/context";
import type { UserAccessStatus } from "@finova/prisma";

export type AdminUserFilters = { q: string; status?: UserAccessStatus };
export type AdminUserCursor = { direction: "after" | "before"; createdAt: Date; id: string };

export function normalizeAdminUserFilters(input: { q?: string; status?: UserAccessStatus }): AdminUserFilters {
  return { q: (input.q ?? "").trim().slice(0, 100), status: input.status };
}

/** The cursor is a query anchor, never an authorization token. Bind it to the exact filters. */
export function encodeAdminUserCursor(row: { createdAt: Date; id: string }, direction: AdminUserCursor["direction"], filters: AdminUserFilters) {
  return Buffer.from(JSON.stringify({ v: 1, direction, at: row.createdAt.toISOString(), id: row.id,
    q: filters.q, status: filters.status ?? null }), "utf8").toString("base64url");
}

export function decodeAdminUserCursor(encoded: string | undefined, filters: AdminUserFilters): AdminUserCursor | null {
  if (!encoded) return null;
  try {
    if (encoded.length > 800 || !/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error("Malformed cursor");
    const raw = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Record<string, unknown>;
    if (raw.v !== 1 || (raw.direction !== "after" && raw.direction !== "before") ||
      raw.q !== filters.q || raw.status !== (filters.status ?? null) ||
      typeof raw.id !== "string" || !raw.id || raw.id.length > 200 ||
      typeof raw.at !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(raw.at)) {
      throw new Error("Malformed cursor");
    }
    const createdAt = new Date(raw.at);
    if (!Number.isFinite(createdAt.getTime()) || createdAt.toISOString() !== raw.at) throw new Error("Malformed cursor");
    return { direction: raw.direction, createdAt, id: raw.id };
  } catch {
    throw new HttpError(400, "INVALID_CURSOR", "Trang danh sách không hợp lệ. Hãy lọc lại từ đầu.");
  }
}
