/** One instance per form. Keep retry keys in memory when a response is lost. */
export function createIdempotentRequest() {
  const attempts = new Map<string, string>();
  let pending: { fingerprint: string; promise: Promise<unknown> } | null = null;

  return function send<T = unknown>(url: string, body: object, method = "POST"): Promise<T> {
    const serialized = JSON.stringify(body);
    const fingerprint = `${method}:${url}:${serialized}`;
    if (pending) {
      if (pending.fingerprint === fingerprint) return pending.promise as Promise<T>;
      return Promise.reject(new Error("Đang lưu thay đổi. Vui lòng chờ hoàn tất."));
    }
    const key = attempts.get(fingerprint) ?? crypto.randomUUID();
    attempts.set(fingerprint, key);
    const promise = (async () => {
      const response = await fetch(url, {
        method, headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: serialized,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || "Không lưu được thay đổi. Vui lòng thử lại.");
      // Only a complete successful response proves the user can start a new action.
      attempts.delete(fingerprint);
      return payload.data as T;
    })().finally(() => { pending = null; });
    pending = { fingerprint, promise };
    return promise;
  };
}
