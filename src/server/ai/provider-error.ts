import { HttpError } from "@/server/context";

const billingCodes = new Set(["insufficient_quota", "insufficient_credits", "credit_balance_exhausted", "billing_hard_limit_reached", "billing_not_active", "organization_spend_limit_exceeded", "project_spend_limit_exceeded", "organization_usage_limit_exceeded"]);
const safeCodes = new Set([...billingCodes, "invalid_api_key", "account_deactivated", "model_not_found", "permission_denied", "insufficient_permissions", "invalid_json_schema", "invalid_request_error", "unsupported_parameter", "unsupported_value", "context_length_exceeded", "invalid_image", "invalid_image_format", "invalid_file", "rate_limit_exceeded", "slow_down", "server_error", "server_is_overloaded"]);
const safeTypes = new Set(["invalid_request_error", "authentication_error", "permission_error", "insufficient_quota", "rate_limit_error", "server_error", "service_unavailable_error"]);

/** Bound all upstream bodies, including error responses, without ever printing them. */
export async function boundedProviderJson(response: Response, limit: number): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("empty");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error("size"); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally { reader.releaseLock(); }
}

export function providerHttpError(response: Pick<Response, "status" | "headers">, payload: unknown, provider: "openai" | "custom" = "openai"): HttpError {
  const label = provider === "openai" ? "OpenAI" : "Nhà cung cấp AI";
  const keySetting = provider === "openai" ? "OPENAI_API_KEY" : "LLM__ApiKey";
  const modelSetting = provider === "openai" ? "FINOVA_AI_MODEL" : "LLM__ChatModelId, LLM__Endpoint và LLM__ApiMode";
  const billing = provider === "openai" ? "OpenAI Platform → Billing" : "trang Billing/hạn mức của nhà cung cấp đang cấu hình";
  const raw = payload && typeof payload === "object" && "error" in payload ? payload.error : null;
  const fields = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const code = typeof fields.code === "string" && safeCodes.has(fields.code) ? fields.code : null;
  const type = typeof fields.type === "string" && safeTypes.has(fields.type) ? fields.type : null;
  // A schema path is used only for classification, never copied into logs or responses.
  const schemaError = typeof fields.param === "string" && /^(?:text\.format|response_format)(?:\.|$)/.test(fields.param);
  const rawId = response.headers.get("x-request-id");
  const requestId = rawId && /^req_[a-zA-Z0-9_-]{8,100}$/.test(rawId) ? rawId : null;
  const rawRetry = Number(response.headers.get("retry-after"));
  const retryAfter = Number.isFinite(rawRetry) && rawRetry > 0 ? Math.min(3600, Math.ceil(rawRetry)) : 60;
  let error: HttpError;
  if (response.status === 401 || code === "invalid_api_key") {
    error = new HttpError(502, "AI_AUTH_FAILED", `${label} từ chối khóa API. Kiểm tra khóa còn hiệu lực và ${keySetting} trong container app; sau khi đổi .env cần tạo lại container.`);
  } else if (code === "credit_balance_exhausted" || code === "insufficient_credits") {
    error = new HttpError(503, "AI_CREDITS_EXHAUSTED", `Số dư tín dụng API đã hết. Vui lòng bổ sung credit tại ${billing} rồi thử lại.`);
  } else if ((code && billingCodes.has(code)) || type === "insufficient_quota") {
    // Billing failures are not transient rate limits: retrying cannot repair them.
    error = new HttpError(503, "AI_QUOTA_EXCEEDED", `Tài khoản hết tín dụng hoặc chạm giới hạn chi tiêu/sử dụng API. Kiểm tra ${billing}; thử lại liên tục sẽ không khắc phục được.`);
  } else if (code === "model_not_found" || response.status === 404) {
    error = new HttpError(502, "AI_MODEL_UNAVAILABLE", `${label} không tìm thấy model/endpoint hoặc khóa chưa có quyền dùng model này. Kiểm tra ${modelSetting} và quyền truy cập model.`);
  } else if (response.status === 403 || ["permission_denied", "insufficient_permissions", "account_deactivated"].includes(code ?? "")) {
    error = new HttpError(502, "AI_ACCESS_DENIED", `${label} từ chối quyền truy cập. Kiểm tra trạng thái tài khoản, quyền của khóa và quyền gọi API.`);
  } else if (code === "invalid_json_schema" || schemaError) {
    error = new HttpError(502, "AI_SCHEMA_INVALID", `${label} từ chối cấu trúc dữ liệu đầu ra của ứng dụng. Cần kiểm tra Structured Outputs/model và cấu hình định dạng JSON.`);
  } else if (response.status === 413 || code === "context_length_exceeded") {
    error = new HttpError(422, "AI_INPUT_TOO_LARGE", "Sao kê vượt giới hạn xử lý của model. Hãy chia thành tệp nhỏ hơn và thử lại.");
  } else if (response.status === 400 || response.status === 422) {
    error = new HttpError(502, "AI_REQUEST_REJECTED", `${label} từ chối định dạng yêu cầu hoặc tệp đầu vào. Kiểm tra model hỗ trợ loại tệp và định dạng JSON đã chọn; xem mã chẩn đoán trong log máy chủ.`);
  } else if (response.status === 429) {
    error = new HttpError(429, "AI_RATE_LIMITED", `${label} đang giới hạn tốc độ yêu cầu/token. Vui lòng chờ rồi thử lại.`, retryAfter);
  } else {
    error = new HttpError(502, "AI_UNAVAILABLE", `${label} tạm thời không phản hồi thành công. Vui lòng thử lại sau.`);
  }
  // Only allowlisted machine codes and a bounded request ID. Never raw error.message,
  // param, model, prompt, statement, Authorization or credential fragments.
  console.warn("AI provider request failed", { status: response.status, code, type, requestId, appCode: error.code });
  if (requestId) error.message += ` Mã hỗ trợ: ${requestId}.`;
  return error;
}
