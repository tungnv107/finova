/** The only origin allowed to issue browser mutations or Better Auth requests. */
export function configuredAppOrigin(): string | null {
  const raw = process.env.BETTER_AUTH_URL || (process.env.NODE_ENV === "production" ? null : "http://localhost:3002");
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (!(["http:", "https:"].includes(url.protocol)) || url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
    return url.origin;
  } catch { return null; }
}

export function isTrustedRequestOrigin(origin: string | null, expected: string): boolean {
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    return parsed.origin === expected && origin === parsed.origin;
  } catch { return false; }
}
