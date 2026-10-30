import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { deleteImportRow } from "@/server/imports";
import { reviewStatementRow } from "@/server/ai/statements";
import { DELETE, PATCH } from "@/app/api/v1/imports/[id]/rows/[rowId]/route";
import { HttpError } from "@/server/context";

const mocks = vi.hoisted(() => ({ remove: vi.fn(), claim: vi.fn(), row: vi.fn(), update: vi.fn(), count: vi.fn(), batch: vi.fn(), wallet: vi.fn(), category: vi.fn(), premium: vi.fn(), context: vi.fn(), origin: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/server/serializable", () => ({ serializable: (work: (db: unknown) => unknown) => work({ importRow: { deleteMany: mocks.remove, updateMany: mocks.claim, findUniqueOrThrow: mocks.row, update: mocks.update, count: mocks.count }, importBatch: { update: mocks.batch }, wallet: { count: mocks.wallet }, category: { count: mocks.category } }) }));
vi.mock("@/server/premium", () => ({ requireWorkspacePremiumInDb: mocks.premium, requireStatementImportContext: mocks.context }));
vi.mock("@/server/http", async original => ({ ...await original<typeof import("@/server/http")>(), assertSameOrigin: mocks.origin }));
const context = { workspaceId: "ws", userId: "user", name: "test", image: null };
const route = { params: Promise.resolve({ id: "batch", rowId: "row" }) };
const input = { kind: "EXPENSE", amount: "50000", date: "2026-01-01", categoryId: "food", destinationWalletId: null, note: "Lunch", confirmed: true };
beforeEach(() => {
  vi.resetAllMocks(); mocks.context.mockResolvedValue(context); mocks.remove.mockResolvedValue({ count: 1 }); mocks.claim.mockResolvedValue({ count: 1 }); mocks.row.mockResolvedValue({ id: "row", walletId: "wallet", sourceHash: "immutable-bank-reference", confidence: null }); mocks.count.mockResolvedValue(0); mocks.category.mockResolvedValue(1);
});

describe("staging row mutations", () => {
  it("deletes only an unposted row from the caller's batch and workspace", async () => {
    await expect(deleteImportRow(context, "batch", "row")).resolves.toEqual({ deleted: true });
    expect(mocks.remove).toHaveBeenCalledWith({ where: { id: "row", batchId: "batch", workspaceId: "ws", transactionId: null, status: { in: ["VALID", "INVALID", "FAILED", "DUPLICATE"] } } });
    expect(mocks.premium).toHaveBeenCalled();
    expect(mocks.batch).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "COMPLETE" } }));
  });
  it("keeps partially reviewed batches open after deleting a row", async () => {
    mocks.count.mockResolvedValue(3);
    await deleteImportRow(context, "batch", "row");
    expect(mocks.batch).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "PREVIEW" } }));
  });
  it("refuses deletion after a commit or for an inaccessible row", async () => {
    mocks.remove.mockResolvedValue({ count: 0 });
    await expect(deleteImportRow(context, "batch", "row")).rejects.toMatchObject({ code: "ROW_NOT_DELETABLE" });
    expect(mocks.batch).not.toHaveBeenCalled();
  });
  it("allows legacy staging rows without confidence to be corrected, preserving source identity", async () => {
    await reviewStatementRow(context, "batch", "row", input);
    expect(mocks.claim.mock.calls[0][0].where).not.toHaveProperty("confidence");
    expect(mocks.claim.mock.calls[0][0].where).toMatchObject({ workspaceId: "ws", batchId: "batch", transactionId: null });
    expect(mocks.update.mock.calls[0][0].data).toMatchObject({ needsReview: false, status: "VALID", amount: "50000" });
    expect(mocks.update.mock.calls[0][0].data).not.toHaveProperty("sourceHash");
  });
  it("refuses foreign or incorrect category selections and future dates", async () => {
    mocks.category.mockResolvedValue(0);
    await expect(reviewStatementRow(context, "batch", "row", input)).rejects.toMatchObject({ code: "INVALID_CATEGORY" });
    await expect(reviewStatementRow(context, "batch", "row", { ...input, date: "2099-01-01" })).rejects.toMatchObject({ code: "FUTURE_DATE" });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("does not make an already posted bank movement importable again after editing", async () => {
    mocks.count.mockResolvedValue(1);
    await reviewStatementRow(context, "batch", "row", input);
    expect(mocks.update.mock.calls[0][0].data.status).toBe("DUPLICATE");
  });
  it.each([DELETE, PATCH])("requires origin and authorization before mutating", async handler => {
    mocks.origin.mockImplementation(() => { throw new HttpError(403, "ORIGIN", "origin"); });
    expect((await handler(new NextRequest("http://localhost/api/v1/imports/batch/rows/row", { method: handler === DELETE ? "DELETE" : "PATCH" }), route)).status).toBe(403);
    expect(mocks.context).not.toHaveBeenCalled();
    mocks.origin.mockReset(); mocks.context.mockRejectedValue(new HttpError(401, "UNAUTHENTICATED", "login"));
    expect((await handler(new NextRequest("http://localhost/api/v1/imports/batch/rows/row", { method: handler === DELETE ? "DELETE" : "PATCH" }), route)).status).toBe(401);
    expect(mocks.remove).not.toHaveBeenCalled(); expect(mocks.claim).not.toHaveBeenCalled();
  });
});
