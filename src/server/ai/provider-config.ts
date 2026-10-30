import { HttpError } from "@/server/context";

type ApiMode = "chat-completions" | "responses";
type ResponseFormat = "json_schema" | "json_object";
export type AiProviderConfig = {
  provider: "openai" | "custom";
  endpoint: string;
  apiKey: string;
  model: string;
  apiMode: ApiMode;
  responseFormat: ResponseFormat;
};

const value = (name: string) => process.env[name]?.trim() || "";
const invalid = (message: string) => new HttpError(503, "AI_CONFIG_INVALID", message);

/** Server environment only. Never serialize this object to the browser or logs. */
export function aiProviderConfig(): AiProviderConfig {
  const endpoint = value("LLM__Endpoint"), apiKey = value("LLM__ApiKey"), model = value("LLM__ChatModelId");
  const apiMode = value("LLM__ApiMode"), responseFormat = value("LLM__ResponseFormat");
  // Partial custom configuration must not silently send financial data to OpenAI.
  if (endpoint || apiKey || model || apiMode || responseFormat) {
    if (!endpoint || !apiKey || !model) throw invalid("Cần cấu hình đủ LLM__Endpoint, LLM__ApiKey và LLM__ChatModelId trên máy chủ.");
    let url: URL;
    try { url = new URL(endpoint); } catch { throw invalid("LLM__Endpoint phải là URL gốc API hợp lệ, ví dụ https://provider.example/v1."); }
    const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((url.protocol !== "https:" && !localHttp) || url.username || url.password || url.search || url.hash) {
      throw invalid("LLM__Endpoint phải dùng HTTPS, không chứa thông tin đăng nhập, query hoặc fragment. HTTP chỉ dùng cho localhost.");
    }
    if (/\/(?:chat\/completions|responses)\/*$/.test(url.pathname)) throw invalid("LLM__Endpoint là URL gốc API (thường kết thúc bằng /v1), không kèm /chat/completions hoặc /responses.");
    if (apiMode && apiMode !== "chat-completions" && apiMode !== "responses") throw invalid("LLM__ApiMode chỉ nhận chat-completions hoặc responses.");
    if (responseFormat && responseFormat !== "json_schema" && responseFormat !== "json_object") throw invalid("LLM__ResponseFormat chỉ nhận json_schema hoặc json_object.");
    return { provider: "custom", endpoint: url.href.replace(/\/+$/, ""), apiKey, model, apiMode: (apiMode || "chat-completions") as ApiMode, responseFormat: (responseFormat || "json_object") as ResponseFormat };
  }
  const openaiKey = value("OPENAI_API_KEY");
  if (!openaiKey) throw new HttpError(503, "AI_NOT_CONFIGURED", "Chưa cấu hình dịch vụ AI. Thiết lập OPENAI_API_KEY hoặc bộ cấu hình LLM__Endpoint, LLM__ApiKey, LLM__ChatModelId.");
  return { provider: "openai", endpoint: "https://api.openai.com/v1", apiKey: openaiKey, model: value("FINOVA_AI_MODEL") || "gpt-4.1", apiMode: "responses", responseFormat: "json_schema" };
}

export function aiConfigured(): boolean {
  try { aiProviderConfig(); return true; } catch { return false; }
}

/** Safe capability hint; does not expose any credential or endpoint. */
export function aiUsesChatCompletions(): boolean {
  try { return aiProviderConfig().apiMode === "chat-completions"; } catch { return false; }
}
