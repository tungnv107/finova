import { afterEach, describe, expect, it, vi } from "vitest";
import { createIdempotentRequest } from "@/lib/idempotent-request";

afterEach(() => vi.unstubAllGlobals());
describe("financial request retries", () => {
  it("reuses a key after a lost response, and issues a new one after confirmed success", async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockImplementation(() => Promise.resolve(Response.json({ data: { id: "saved" } })));
    vi.stubGlobal("fetch", fetch);
    const send = createIdempotentRequest();
    await expect(send("/transactions", { amount: "50000" })).rejects.toThrow();
    expect(await send("/transactions", { amount: "50000" })).toEqual({ id: "saved" });
    await send("/transactions", { amount: "50000" });
    const keys = fetch.mock.calls.map(call => call[1].headers["Idempotency-Key"]);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[1]);
  });
  it("coalesces double submits and prevents an overlapping different mutation", async () => {
    let resolve!: (response: Response) => void;
    const fetch = vi.fn(() => new Promise<Response>(r => { resolve = r; }));
    vi.stubGlobal("fetch", fetch);
    const send = createIdempotentRequest();
    const first = send("/payments", { amount: "50000" });
    expect(send("/payments", { amount: "50000" })).toBe(first);
    await expect(send("/payments", { amount: "60000" })).rejects.toThrow("Đang lưu");
    resolve(Response.json({ data: true }));
    await first;
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("retains the original attempt across edited and reverted input, and malformed responses", async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response("upstream unavailable", { status: 502 })));
    vi.stubGlobal("fetch", fetch);
    const send = createIdempotentRequest();
    for (const amount of ["100", "200", "100"]) await expect(send("/goals/a/allocations", { amount })).rejects.toThrow();
    const keys = fetch.mock.calls.map(call => call[1].headers["Idempotency-Key"]);
    expect(keys[0]).not.toBe(keys[1]); expect(keys[0]).toBe(keys[2]);
  });
});
