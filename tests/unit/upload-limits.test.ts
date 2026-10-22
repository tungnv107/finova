import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { limitedFormData } from "@/server/http";

function requestWithCsv(csv: string, extraHeaders: Record<string, string> = {}) {
  const form = new FormData();
  form.append("file", new File([csv], "bank.csv", { type: "text/csv" }));
  form.append("options", JSON.stringify({ dateColumn: "date", amountColumn: "amount" }));
  return new NextRequest("http://localhost:3002/api/v1/imports/preview", {
    method: "POST", body: form, headers: extraHeaders,
  });
}

describe("bounded multipart reader", () => {
  it("accepts a small multipart upload without Content-Length", async () => {
    const form = await limitedFormData(requestWithCsv("date,amount\n2026-10-20,1000"), 2000);
    expect((form.get("file") as File).name).toBe("bank.csv");
  });

  it("rejects oversized streams without trusting Content-Length", async () => {
    // A custom producer models an incoming upload without undici's FormData
    // encoder continuing to enqueue bytes after its stream is cancelled.
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(2000)); controller.close(); },
    });
    const request = new NextRequest("http://localhost:3002/api/v1/imports/preview", {
      method: "POST", body,
      headers: { "content-type": "multipart/form-data; boundary=finova-test" },
      duplex: "half",
    } as unknown as ConstructorParameters<typeof NextRequest>[1]);
    await expect(limitedFormData(request, 1000))
      .rejects.toMatchObject({ status: 413, code: "SIZE" });
  });

  it("rejects declared oversized uploads immediately", async () => {
    await expect(limitedFormData(requestWithCsv("a", { "content-length": "9999" }), 1000))
      .rejects.toMatchObject({ status: 413, code: "SIZE" });
  });
});
