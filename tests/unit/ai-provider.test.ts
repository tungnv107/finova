import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { aiJson } from "@/server/ai/provider";
import { failure } from "@/server/http";
const fetchMock = vi.fn();
beforeEach(() => {
  for (const key of ["LLM__Endpoint", "LLM__ApiKey", "LLM__ChatModelId", "LLM__ApiMode", "LLM__ResponseFormat"]) vi.stubEnv(key, "");
  vi.stubGlobal("fetch", fetchMock); vi.stubEnv("OPENAI_API_KEY", "test-key"); fetchMock.mockReset(); vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
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
    await expect(aiJson("test", "", [], schema)).rejects.toMatchObject({ status: 429, retryAfterSeconds: 60, code: "AI_RATE_LIMITED" });
  });
  it("bounds timeout and oversized responses", async () => {
    fetchMock.mockRejectedValue(new DOMException("timeout", "TimeoutError")); await expect(aiJson("test", "", [], schema)).rejects.toMatchObject({ status: 504 });
    fetchMock.mockResolvedValue(new Response("x".repeat(2 * 1024 * 1024 + 1))); await expect(aiJson("test", "", [], schema)).rejects.toMatchObject({ status: 502 });
  });
  it("preserves the explicitly configured model and trims config whitespace", async () => {
    vi.stubEnv("FINOVA_AI_MODEL", " gpt-5.6-sol "); vi.stubEnv("OPENAI_API_KEY", " test-key ");
    fetchMock.mockResolvedValue(Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: '{"answer":"ok"}' }] }] }));
    await aiJson("test", "", [], schema);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe("gpt-5.6-sol");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer test-key");
  });
  it.each([
    [401, "invalid_api_key", "AI_AUTH_FAILED", 502],
    [404, "model_not_found", "AI_MODEL_UNAVAILABLE", 502],
    [403, "permission_denied", "AI_ACCESS_DENIED", 502],
    [429, "credit_balance_exhausted", "AI_CREDITS_EXHAUSTED", 503],
    [429, "insufficient_quota", "AI_QUOTA_EXCEEDED", 503],
    [429, "project_spend_limit_exceeded", "AI_QUOTA_EXCEEDED", 503],
    [429, "organization_usage_limit_exceeded", "AI_QUOTA_EXCEEDED", 503],
    [400, "invalid_json_schema", "AI_SCHEMA_INVALID", 502],
    [400, "context_length_exceeded", "AI_INPUT_TOO_LARGE", 422],
    [400, "unsupported_value", "AI_REQUEST_REJECTED", 502],
    [503, "server_is_overloaded", "AI_UNAVAILABLE", 502],
  ])("classifies HTTP %s / %s without exposing upstream body", async (status, code, appCode, expectedStatus) => {
    fetchMock.mockResolvedValue(Response.json({ error: { code, message: "PRIVATE_STATEMENT_AND_KEY" } }, { status: Number(status), headers: { "x-request-id": "req_12345678abc" } }));
    const error = await aiJson("test", "", [], schema).catch(e => e);
    expect(error).toMatchObject({ status: expectedStatus, code: appCode });
    expect(error.message).toContain("req_12345678abc"); expect(error.message).not.toContain("PRIVATE_STATEMENT_AND_KEY");
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain("PRIVATE_STATEMENT_AND_KEY");
    if (expectedStatus === 503) expect(error.retryAfterSeconds).toBeUndefined();
  });
  it("maps the production exhausted-credit response without retry advice", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: { code: "credit_balance_exhausted", type: "insufficient_quota" } }, { status: 429 }));
    const error = await aiJson("test", "", [], schema).catch(e => e);
    expect(error).toMatchObject({ code: "AI_CREDITS_EXHAUSTED", status: 503 }); expect(error.message).toContain("Billing");
    expect(error.retryAfterSeconds).toBeUndefined();
    expect(vi.mocked(console.warn).mock.calls[0][1]).toMatchObject({ code: "credit_balance_exhausted", type: "insufficient_quota" });
    const http = failure(error);
    expect(http.status).toBe(503); expect(http.headers.get("Retry-After")).toBeNull();
    expect(await http.json()).toMatchObject({ error: { code: "AI_CREDITS_EXHAUSTED" } });
  });
  it("recognizes a new billing code by insufficient_quota type", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: { code: "new_billing_code", type: "insufficient_quota" } }, { status: 429 }));
    await expect(aiJson("test", "", [], schema)).rejects.toMatchObject({ code: "AI_QUOTA_EXCEEDED", status: 503 });
    expect(vi.mocked(console.warn).mock.calls[0][1]).toMatchObject({ code: null });
  });
  it("respects bounded Retry-After only for transient rate limits", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: { code: "rate_limit_exceeded" } }, { status: 429, headers: { "retry-after": "120" } }));
    await expect(aiJson("test", "", [], schema)).rejects.toMatchObject({ code: "AI_RATE_LIMITED", retryAfterSeconds: 120 });
  });
  it("recognizes schema rejection by param even with generic code", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: { code: "invalid_request_error", param: "text.format.schema" } }, { status: 400 }));
    await expect(aiJson("test", "", [], schema)).rejects.toMatchObject({ code: "AI_SCHEMA_INVALID" });
  });
  it("never forwards unknown machine values or malformed request IDs to logs", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: { code: "PRIVATE_CODE", type: "PRIVATE_TYPE", param: "PRIVATE_PARAM", message: "PRIVATE_BODY" } }, { status: 500, headers: { "x-request-id": "PRIVATE_ID" } }));
    const error = await aiJson("test", "", [], schema).catch(e => e);
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain("PRIVATE"); expect(error.message).not.toContain("PRIVATE");
  });
  it("handles oversized error bodies using HTTP status and without leaking their contents", async () => {
    fetchMock.mockResolvedValue(new Response("PRIVATE".repeat(10000), { status: 401 }));
    await expect(aiJson("test", "", [], schema)).rejects.toMatchObject({ code: "AI_AUTH_FAILED" });
  });
  it("keeps connection failures separate from timeouts", async () => {
    fetchMock.mockRejectedValue(new TypeError("DNS_PRIVATE"));
    await expect(aiJson("test", "", [], schema)).rejects.toMatchObject({ code: "AI_CONNECTION_FAILED", status: 502 });
  });
  it("classifies a failed response object even if HTTP status is 200", async () => {
    fetchMock.mockResolvedValue(Response.json({ status: "failed", error: { code: "insufficient_quota" } }));
    await expect(aiJson("test", "", [], schema)).rejects.toMatchObject({ code: "AI_QUOTA_EXCEEDED" });
  });
});
