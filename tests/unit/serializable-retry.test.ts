import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@finova/prisma";
import { serializable } from "@/server/serializable";

const mocked = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: mocked.transaction } }));

function conflict(code: "P2034" | "P2002") {
  return new Prisma.PrismaClientKnownRequestError("Concurrent write", {
    code, clientVersion: "6.19.3",
  });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("Serializable financial operation retry", () => {
  it("reruns the entire transaction after a serialization conflict", async () => {
    const db = { id: "tx-client" };
    mocked.transaction.mockImplementation(async (fn: (client: typeof db) => Promise<unknown>) => fn(db));
    const work = vi.fn().mockRejectedValueOnce(conflict("P2034")).mockResolvedValueOnce("posted");
    await expect(serializable(work)).resolves.toBe("posted");
    expect(work).toHaveBeenCalledTimes(2);
    expect(work).toHaveBeenNthCalledWith(1, db);
    expect(work).toHaveBeenNthCalledWith(2, db);
    expect(mocked.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 20000,
    });
  });

  it("rechecks business state on a unique-key race", async () => {
    mocked.transaction.mockImplementation(async (fn: () => Promise<unknown>) => fn());
    const work = vi.fn().mockRejectedValueOnce(conflict("P2002")).mockResolvedValueOnce("existing-transaction");
    await expect(serializable(work)).resolves.toBe("existing-transaction");
    expect(work).toHaveBeenCalledTimes(2);
  });

  it("does not retry business validation failures", async () => {
    const invalid = new Error("VERSION_CONFLICT");
    mocked.transaction.mockRejectedValue(invalid);
    const work = vi.fn();
    await expect(serializable(work)).rejects.toBe(invalid);
    expect(mocked.transaction).toHaveBeenCalledTimes(1);
  });

  it("fails after bounded retries instead of looping on an unavailable database", async () => {
    mocked.transaction.mockRejectedValue(conflict("P2034"));
    await expect(serializable(vi.fn())).rejects.toMatchObject({ code: "P2034" });
    expect(mocked.transaction).toHaveBeenCalledTimes(5);
  });
});
