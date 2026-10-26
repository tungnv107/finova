/** Keep operator-entered secrets and account numbers out of persisted reasons and audit logs. */
export function sanitizeOperatorReason(input: string): string {
  return input.trim()
    .replace(/\b((?:Bearer|Basic)\s+)[A-Za-z0-9._~+/-]+=*/gi, "$1[REDACTED]")
    // Accept JSON-style quoted keys as well as key=value, query strings, and free-form notes.
    .replace(/(^|[^\w])(["']?(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|private[_-]?key|password|passwd|token|secret|authorization|account[_-]?number|bank[_-]?account)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;}\]]+)/gim,
      "$1$2[REDACTED]")
    .replace(/\b\d{9,19}\b/g, "[REDACTED_ACCOUNT]");
}
