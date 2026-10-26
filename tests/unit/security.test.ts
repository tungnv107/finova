import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { configuredAppOrigin, isTrustedRequestOrigin } from "@/server/origin";
import { policyForRequest, RATE_LIMITS, shouldLimitAuthRequest, trustedProxyClientIp } from "@/server/rate-limit";
import { HttpError } from "@/server/context";
import { failure } from "@/server/http";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** Context-based Premium guards and system-role guards also authenticate requests. */
const hasAuthenticatedRequestGuard = (handler: string) =>
  /require(?:Context|StatementImportContext|BankSyncContext|NotificationsContext)\(request\)/.test(handler) ||
  /requireSystemRole\([^)]*,\s*request(?:,\s*\{[^}]*\})?\s*\)/.test(handler);

describe("origin validation", () => {
  it("accepts only the exact configured browser origin", () => {
    const expected = "https://finance.example.com";
    expect(isTrustedRequestOrigin(expected, expected)).toBe(true);
    for (const origin of [null, "null", "", "https://attacker.example.com", "https://finance.example.com.attacker.test",
      "https://finance.example.com/", "https://user@finance.example.com", "http://finance.example.com", "not a url"]) {
      expect(isTrustedRequestOrigin(origin, expected)).toBe(false);
    }
  });
  it("fails closed for missing and malformed production configuration", () => {
    const originalUrl = process.env.BETTER_AUTH_URL;
    const originalMode = process.env.NODE_ENV;
    try {
      Object.assign(process.env, { NODE_ENV: "production", BETTER_AUTH_URL: "broken url" });
      expect(configuredAppOrigin()).toBeNull();
      delete process.env.BETTER_AUTH_URL;
      expect(configuredAppOrigin()).toBeNull();
      process.env.BETTER_AUTH_URL = "https://finance.example.com";
      expect(configuredAppOrigin()).toBe("https://finance.example.com");
    } finally {
      if (originalUrl === undefined) delete process.env.BETTER_AUTH_URL;
      else process.env.BETTER_AUTH_URL = originalUrl;
      if (originalMode === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
      else Object.assign(process.env, { NODE_ENV: originalMode });
    }
  });
});

describe("API policies", () => {
  const classify = (path: string, method: string) => policyForRequest(new NextRequest(`http://localhost:3002${path}`, { method }));
  it("separates upload, export, scheduling and finance mutations", () => {
    expect(classify("/api/v1/imports/preview", "POST")).toBe("upload");
    expect(classify("/api/v1/imports/columns", "POST")).toBe("upload");
    expect(classify("/api/v1/transactions", "POST")).toBe("mutation");
    expect(classify("/api/v1/recurring", "PUT")).toBe("sync");
    expect(classify("/api/v1/recurring/a/confirm", "POST")).toBe("sync");
    expect(classify("/api/v1/exports/reports.pdf", "GET")).toBe("export");
    expect(classify("/api/v1/reports/overview", "GET")).toBe("report");
    expect(classify("/api/v1/reports/heatmap", "GET")).toBe("report");
    expect(classify("/api/v1/transactions", "GET")).toBe("report");
    expect(classify("/api/v1/admin/billing/notices/a/requeue", "POST")).toBe("mutation");
    expect(classify("/api/v1/wallets", "GET")).toBeNull();
    expect(RATE_LIMITS.upload).toBeLessThan(RATE_LIMITS.mutation);
  });
  it("only throttles sensitive auth endpoints, not routine session reads", () => {
    const auth = (path: string, method: string) => shouldLimitAuthRequest(new NextRequest(`http://localhost:3002${path}`, { method }));
    expect(auth("/api/auth/sign-in/social", "POST")).toBe(true);
    expect(auth("/api/auth/callback/google", "GET")).toBe(true);
    expect(auth("/api/auth/sign-out", "POST")).toBe(true);
    expect(auth("/api/auth/get-session", "GET")).toBe(false);
    expect(auth("/api/v1/wallets", "POST")).toBe(false);
  });
  it("accepts only a single validated IP from explicitly trusted header names", () => {
    const headers = new Headers({ "cf-connecting-ip": "203.0.113.5", "x-forwarded-for": "192.0.2.9" });
    expect(trustedProxyClientIp(headers)).toBeNull(); // no implicit header trust
    expect(trustedProxyClientIp(headers, "cf-connecting-ip")).toBe("203.0.113.5");
    expect(trustedProxyClientIp(headers, "x-forwarded-for")).toBeNull();
    expect(trustedProxyClientIp(new Headers({ "x-real-ip": "2001:db8::1" }), "x-real-ip")).toBe("2001:db8::1");
    expect(trustedProxyClientIp(new Headers({ "x-real-ip": "203.0.113.5, 192.0.2.9" }), "x-real-ip")).toBeNull();
    expect(trustedProxyClientIp(new Headers({ "x-real-ip": "203.0.113.5:80" }), "x-real-ip")).toBeNull();
    expect(trustedProxyClientIp(new Headers(), "true-client-ip")).toBeNull();
  });
  it("returns the accurate retry interval for quota errors", () => {
    const response = failure(new HttpError(429, "RATE_LIMITED", "limit", 7));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("7");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
  it("enforces shared PostgreSQL quotas through both delegated Premium and Admin guards", () => {
    const server = join(process.cwd(), "src", "server");
    expect(readFileSync(join(server, "premium.ts"), "utf8")).toContain("requireContext(request)");
    expect(readFileSync(join(server, "context.ts"), "utf8")).toContain("limitAuthenticatedRequest(context, request)");
    expect(readFileSync(join(server, "system-auth.ts"), "utf8")).toContain("limitSystemRequest(session.user.id, request)");
    expect(readFileSync(join(server, "rate-limit.ts"), "utf8")).toContain("consumeRateLimitKey(`system:${userId}`, policy)");
  });
  it("requires shared read throttling for every reporting GET and CSV error export", () => {
    const root = join(process.cwd(), "src", "app", "api", "v1");
    const directories = [join(root, "reports"), join(root, "transactions"), join(root, "imports")];
    for (const directory of directories) {
      function inspect(dir: string) {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const full = join(dir, entry.name);
          if (entry.isDirectory()) { inspect(full); continue; }
          if (entry.name !== "route.ts") continue;
          const relative = full.slice(root.length).replaceAll("\\", "/");
          if (!relative.startsWith("/reports/") && relative !== "/transactions/route.ts" && !relative.endsWith("/errors.csv/route.ts")) continue;
          const source = readFileSync(full, "utf8");
          const get = source.match(/export async function GET\([^]*?(?=export async function |$)/)?.[0];
          expect(hasAuthenticatedRequestGuard(get ?? ""), `${full}: missing authenticated rate-limited guard`).toBe(true);
        }
      }
      inspect(directory);
    }
  });
  it("requires Origin and authenticated throttling for every v1 mutation route", () => {
    const root = join(process.cwd(), "src", "app", "api", "v1");
    function check(directory: string) {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const full = join(directory, entry.name);
        if (entry.isDirectory()) { check(full); continue; }
        if (entry.name !== "route.ts") continue;
        const parts = readFileSync(full, "utf8").split(/(?=export async function )/);
        for (const part of parts) {
          if (!/^export async function (POST|PUT|PATCH|DELETE)\(/.test(part)) continue;
          expect(part, `${full}: missing Origin guard`).toContain("assertSameOrigin(request)");
          expect(hasAuthenticatedRequestGuard(part), `${full}: missing authenticated rate-limited guard`).toBe(true);
        }
      }
    }
    check(root);
  });
});
