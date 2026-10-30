import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { aiJson } from "@/server/ai/provider";
const fetchMock = vi.fn();
beforeEach(() => { vi.stubGlobal("fetch", fetchMock); vi.stubEnv("OPENAI_API_KEY", "test-key"); fetchMock.mockReset(); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const schema = z.object({ answer: z.string() });
describe("P0 provider boundary", () => {
  it("uses stateless Responses structured output and never a client key", async () => {
    fetchMock.mockResolvedValue(Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: '{"answer":"ok"}' }] }] }));
    expect(await aiJson("test", "instruction", [{ type: "input_text", text: "data" }], schema)).toEqual({ answer: "ok" });
    const [url, options] = fetchMock.mock.calls[0]; expect(url).toBe("https://api.openai.com/v1/responses");
    const body = JSON.parse(options.body); expect(body.store).toBe(false); expect(body.text.format.strict).toBe(true); expect(body.instructions).toContain("untrusted DATA");
  });
  it.each(["incomplete", "failed"])("rejects %s before any rows can be staged", async status => {
    fetchMock.mockResolvedValue(Response.json({ status, output: [] })); await expect(aiJson("test", "", [], schema)).rejects.toMatchObject({ code: "AI_INVALID_RESPONSE" });
  });
  it.each(["not json", '{"answer":123}'])("rejects invalid model output %s", async text => {
    fetchMock.mockResolvedValue(Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text }] }] }));
    await expect(aiJson("test", "", [], schema)).rejects.toMatchObject({ status: 502 });
  });
  it("handles refusals", async () => {
    fetchMock.mockResolvedValue(Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "refusal" }] }] }));
    await expect(aiJson("test", "", [], schema)).rejects.toMatchObject({ status: 502 });
  });
  it("reports missing configuration without a request", async () => {
    vi.stubEnv("OPENAI_API_KEY", ""); await expect(aiJson("test", "", [], schema)).rejects.toMatchObject({ code: "AI_NOT_CONFIGURED" }); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("sanitizes provider failures and maps rate limits", async () => {
    fetchMock.mockResolvedValue(new Response("sensitive provider error", { status: 429 }));
    await expect(aiJson("test", "", [], schema)).rejects.toMatchObject({ status: 429, retryAfterSeconds: 60, code: "AI_UNAVAILABLE" });
  });
  it("bounds timeout and oversized responses", async () => {
    fetchMock.mockRejectedValue(new Error("network secret")); await expect(aiJson("test", "", [], schema)).rejects.toMatchObject({ status: 504 });
    fetchMock.mockResolvedValue(new Response("x".repeat(2 * 1024 * 1024 + 1))); await expect(aiJson("test", "", [], schema)).rejects.toMatchObject({ status: 502 });
  });
});
