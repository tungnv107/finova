import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { failure, readJsonBody } from "@/server/http";

vi.mock("@/server/context", () => ({
  HttpError: class HttpError extends Error {
    constructor(public status: number, public code: string, message: string) { super(message); }
  },
}));

function post(body: BodyInit, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost:3002/api/v1/wallets", { method: "POST", body, headers });
}

afterEach(() => vi.restoreAllMocks());

describe("bounded JSON request parsing", () => {
  it("decodes a valid UTF-8 JSON payload", async () => {
    expect(await readJsonBody(post('{"name":"Ví tiết kiệm"}'))).toEqual({ name: "Ví tiết kiệm" });
  });

  it("returns private 400 for syntactically invalid JSON", async () => {
    const response = failure(await readJsonBody(post("{")).catch(error => error));
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(await response.json()).toMatchObject({ error: { code: "INVALID_JSON" } });
  });

  it("rejects invalid UTF-8 as malformed JSON", async () => {
    const response = failure(await readJsonBody(post(new Uint8Array([0xff]))).catch(error => error));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "INVALID_JSON" } });
  });

  it("rejects both declared and actual request bodies larger than 64 KiB", async () => {
    const declared = post("{}", { "Content-Length": "70000" });
    const streamed = post("a".repeat(65537));
    for (const request of [declared, streamed]) {
      const response = failure(await readJsonBody(request).catch(error => error));
      expect(response.status).toBe(413);
      expect(await response.json()).toMatchObject({ error: { code: "SIZE" } });
    }
  });

  it("does not misclassify unrelated programming SyntaxErrors as user input", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = failure(new SyntaxError("Unexpected token in server code"));
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: { code: "SERVER_ERROR" } });
  });
});
