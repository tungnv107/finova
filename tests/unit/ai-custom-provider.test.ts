import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { aiConfigured, aiJson, aiUsesChatCompletions } from "@/server/ai/provider";
import { statementSchema } from "@/server/ai/statements";

const fetchMock = vi.fn();
const schema = z.object({ answer: z.string() });
const success = () => Response.json({ choices: [{ finish_reason: "stop", message: { role: "assistant", content: '{"answer":"ok"}' } }] });
beforeEach(() => {
  vi.stubEnv("LLM__Endpoint", " https://9router.haui.com.vn/v1/// ");
  vi.stubEnv("LLM__ApiKey", " custom-test-key ");
  vi.stubEnv("LLM__ChatModelId", " tungnv ");
  vi.stubEnv("LLM__ApiMode", ""); vi.stubEnv("LLM__ResponseFormat", "");
  vi.stubEnv("OPENAI_API_KEY", "OPENAI_DO_NOT_SEND"); vi.stubEnv("FINOVA_AI_MODEL", "OPENAI_MODEL_DO_NOT_SEND");
  fetchMock.mockReset().mockImplementation(async () => success());
  vi.stubGlobal("fetch", fetchMock); vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("custom provider selection and transport", () => {
  it("uses only the custom endpoint, credential and model for text, images and PDFs", async () => {
    const image = "data:image/png;base64,aW1hZ2U=", pdf = "data:application/pdf;base64,cGRm";
    expect(aiConfigured()).toBe(true); expect(aiUsesChatCompletions()).toBe(true);
    expect(await aiJson("statement", "Read transactions", [{ type: "input_text", text: "untrusted data" }, { type: "input_image", image_url: image, detail: "high" }, { type: "input_file", filename: "statement.pdf", file_data: pdf }], schema)).toEqual({ answer: "ok" });
    const [url, options] = fetchMock.mock.calls[0], body = JSON.parse(options.body);
    expect(url).toBe("https://9router.haui.com.vn/v1/chat/completions");
    expect(options).toMatchObject({ redirect: "error", cache: "no-store", headers: { Authorization: "Bearer custom-test-key" } });
    expect(body).toMatchObject({ model: "tungnv", stream: false, store: false, response_format: { type: "json_object" } });
    expect(body.messages[0].content).toContain('"answer":{"type":"string"}');
    expect(body.messages[0].content).toContain("untrusted DATA");
    expect(body.messages[1].content).toEqual([{ type: "text", text: "untrusted data" }, { type: "image_url", image_url: { url: image, detail: "high" } }, { type: "file", file: { filename: "statement.pdf", file_data: pdf } }]);
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("OPENAI_");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("does not require an OpenAI key when custom config is complete", async () => {
    vi.stubEnv("OPENAI_API_KEY", ""); expect(aiConfigured()).toBe(true);
    await expect(aiJson("test", "", [], schema)).resolves.toEqual({ answer: "ok" });
  });
  it.each(["LLM__Endpoint", "LLM__ApiKey", "LLM__ChatModelId"])("fails closed when %s is missing even if OpenAI is configured", async key => {
    vi.stubEnv(key, " "); expect(aiConfigured()).toBe(false);
    await expect(aiJson("test", "", [], schema)).rejects.toMatchObject({ code: "AI_CONFIG_INVALID" }); expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(["not-a-url", "http://remote.example/v1", "ftp://remote.example/v1", "https://user:PRIVATE_KEY@remote.example/v1", "https://remote.example/v1?key=PRIVATE_KEY", "https://remote.example/v1#PRIVATE_KEY", "https://remote.example/v1/chat/completions/", "https://remote.example/v1/responses"])("rejects unsafe or ambiguous endpoint %s without echoing secrets", async endpoint => {
    vi.stubEnv("LLM__Endpoint", endpoint); expect(aiConfigured()).toBe(false);
    const error = await aiJson("test", "", [], schema).catch(e => e);
    expect(error).toMatchObject({ code: "AI_CONFIG_INVALID" }); expect(error.message).not.toContain("PRIVATE_KEY"); expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(["LLM__ApiMode", "LLM__ResponseFormat"])("rejects an invalid %s before sending data", async key => {
    vi.stubEnv(key, "typo"); expect(aiConfigured()).toBe(false);
    await expect(aiJson("test", "", [], schema)).rejects.toMatchObject({ code: "AI_CONFIG_INVALID" }); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("can request strict structured output via Chat Completions", async () => {
    vi.stubEnv("LLM__ResponseFormat", "json_schema"); await aiJson("test", "", [], schema);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).response_format).toMatchObject({ type: "json_schema", json_schema: { name: "test", strict: true, schema: { required: ["answer"] } } });
  });
  it.each(["doc", "docx", "xls"])("refuses unsupported %s files before any request instead of silently dropping content", async ext => {
    await expect(aiJson("test", "", [{ type: "input_file", filename: `statement.${ext}`, file_data: "data:application/octet-stream;base64,ZmlsZQ==" }], schema)).rejects.toMatchObject({ code: "AI_FILE_UNSUPPORTED" }); expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(["json_object", "json_schema"])("supports Responses for document-capable custom providers with %s", async format => {
    vi.stubEnv("LLM__ApiMode", "responses"); vi.stubEnv("LLM__ResponseFormat", format);
    fetchMock.mockResolvedValue(Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: '{"answer":"ok"}' }] }] }));
    const content = [{ type: "input_file" as const, filename: "statement.docx", file_data: "data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,ZmlsZQ==" }];
    await expect(aiJson("test", "", content, schema)).resolves.toEqual({ answer: "ok" });
    expect(aiUsesChatCompletions()).toBe(false);
    const [url, options] = fetchMock.mock.calls[0], body = JSON.parse(options.body);
    expect(url).toBe("https://9router.haui.com.vn/v1/responses"); expect(body.input[0].content).toEqual(content); expect(body.text.format.type).toBe(format); expect(body.messages).toBeUndefined();
  });
  it.each([["length", "AI_OUTPUT_TRUNCATED"], ["content_filter", "AI_OUTPUT_REFUSED"], ["tool_calls", "AI_INVALID_RESPONSE"], [undefined, "AI_INVALID_RESPONSE"]])("rejects unfinished or unsafe completion %s even if JSON is parseable", async (finish_reason, code) => {
    fetchMock.mockResolvedValue(Response.json({ choices: [{ finish_reason, message: { content: '{"answer":"ok"}' } }] }));
    await expect(aiJson("test", "", [], schema)).rejects.toMatchObject({ code });
  });
  it.each([{ tool_calls: [{ name: "unsafe" }] }, { function_call: { name: "unsafe" } }, { content: null }])("rejects invalid/tool output %j", async message => {
    fetchMock.mockResolvedValue(Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"answer":"ok"}', ...message } }] }));
    await expect(aiJson("test", "", [], schema)).rejects.toMatchObject({ code: "AI_INVALID_RESPONSE" });
  });
  it.each(['```json\n{"answer":"ok"}\n```', '  ```JSON\r\n{"answer":"ok"}\r\n```  ', '```\n{"answer":"ok"}\n```'])("accepts a complete JSON fence from a compatible provider: %s", async content => {
    fetchMock.mockResolvedValue(Response.json({ choices: [{ finish_reason: "stop", message: { content } }] }));
    await expect(aiJson("test", "", [], schema)).resolves.toEqual({ answer: "ok" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("accepts the fenced bank-statement shape observed from 9router without changing financial fields", async () => {
    const statement = { currency: "VND", complete: true, warnings: [], rows: [
      { date: "2026-10-29", amount: "50000", kind: "EXPENSE", note: "Ăn trưa", reference: "TEST-001", categoryId: "food", confidence: 0.99, categoryConfidence: 0.97, reason: "Giao dịch chi rõ ràng." },
      { date: "2026-10-29", amount: "500000", kind: "INCOME", note: "Lương", reference: "TEST-002", categoryId: "salary", confidence: 0.99, categoryConfidence: 0.97, reason: "Giao dịch thu rõ ràng." },
    ] };
    fetchMock.mockResolvedValue(Response.json({ choices: [{ finish_reason: "stop", message: { role: "assistant", content: "```json\n" + JSON.stringify(statement, null, 2) + "\n```" } }] }));
    await expect(aiJson("bank_statement", "Read transactions", [], statementSchema)).resolves.toEqual(statement);
  });
  it("accepts a complete JSON fence in custom Responses json_object mode", async () => {
    vi.stubEnv("LLM__ApiMode", "responses");
    fetchMock.mockResolvedValue(Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: '```json\n{"answer":"ok"}\n```' }] }] }));
    await expect(aiJson("test", "", [], schema)).resolves.toEqual({ answer: "ok" });
  });
  it.each([
    'Here is the result: ```json\n{"answer":"ok"}\n```',
    '```json\n{"answer":"ok"}\n```\nMore text',
    '```json\n{"answer":"ok"}\n```\n```json\n{"answer":"second"}\n```',
    '```json\n{"answer":"ok"}',
    '```json\n{"answer":\n```',
    '```javascript\n{"answer":"ok"}\n```',
    'PRIVATE_PROVIDER_CONTENT',
  ])("rejects incomplete, mixed or non-JSON output without leaking it: %s", async content => {
    fetchMock.mockResolvedValue(Response.json({ choices: [{ finish_reason: "stop", message: { content } }] }));
    const error = await aiJson("test", "", [], schema).catch(e => e);
    expect(error).toMatchObject({ code: "AI_OUTPUT_NOT_JSON" });
    expect(error.message).not.toContain(content);
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(content);
  });
  it.each(['{"answer":123}', '```json\n{"answer":123}\n```', '```json\n{}\n```'])("still enforces the schema after removing formatting: %s", async content => {
    fetchMock.mockResolvedValue(Response.json({ choices: [{ finish_reason: "stop", message: { content } }] }));
    await expect(aiJson("test", "", [], schema)).rejects.toMatchObject({ code: "AI_OUTPUT_SCHEMA_MISMATCH" });
  });
  it("keeps strict json_schema output strict", async () => {
    vi.stubEnv("LLM__ResponseFormat", "json_schema");
    fetchMock.mockResolvedValue(Response.json({ choices: [{ finish_reason: "stop", message: { content: '```json\n{"answer":"ok"}\n```' } }] }));
    await expect(aiJson("test", "", [], schema)).rejects.toMatchObject({ code: "AI_OUTPUT_NOT_JSON" });
  });
  it("does not parse a fenced result when the provider reports truncation or refusal", async () => {
    const content = '```json\n{"answer":"ok"}\n```';
    fetchMock.mockResolvedValue(Response.json({ choices: [{ finish_reason: "length", message: { content } }] }));
    await expect(aiJson("test", "", [], schema)).rejects.toMatchObject({ code: "AI_OUTPUT_TRUNCATED" });
    fetchMock.mockResolvedValue(Response.json({ choices: [{ finish_reason: "stop", message: { content, refusal: "PRIVATE_REFUSAL" } }] }));
    await expect(aiJson("test", "", [], schema)).rejects.toMatchObject({ code: "AI_OUTPUT_REFUSED" });
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain("PRIVATE_REFUSAL");
  });
  it.each([null, {}, { choices: [] }, { choices: [{ finish_reason: "stop" }] }])("rejects malformed response %j", async result => {
    fetchMock.mockResolvedValue(Response.json(result)); await expect(aiJson("test", "", [], schema)).rejects.toMatchObject({ code: "AI_INVALID_RESPONSE" });
  });
  it("reports custom authentication failure without falling back or disclosing the key", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "PRIVATE_UPSTREAM_MESSAGE" }, { status: 401 }));
    const error = await aiJson("test", "", [], schema).catch(e => e);
    expect(error).toMatchObject({ code: "AI_AUTH_FAILED" }); expect(error.message).toContain("LLM__ApiKey");
    expect(error.message).not.toContain("OpenAI"); expect(error.message).not.toContain("PRIVATE_UPSTREAM");
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain("PRIVATE_UPSTREAM"); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("classifies custom structured-output rejection", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: { param: "response_format.json_schema", code: "invalid_request_error" } }, { status: 400 }));
    await expect(aiJson("test", "", [], schema)).rejects.toMatchObject({ code: "AI_SCHEMA_INVALID" });
  });
  it("classifies an error envelope even with HTTP 200", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: { code: "insufficient_quota" } }));
    const error = await aiJson("test", "", [], schema).catch(e => e);
    expect(error).toMatchObject({ code: "AI_QUOTA_EXCEEDED" }); expect(error.message).not.toContain("OpenAI");
  });
});
