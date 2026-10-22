/**
 * Google OAuth pre-login smoke test against a running local Finova server.
 * Does not sign in, retain cookies or print OAuth URLs, state or credentials.
 *
 * Usage: node --env-file=.env scripts/oauth-smoke.mjs [--probe-google]
 */
import assert from "node:assert/strict";

const base = new URL(process.env.BETTER_AUTH_URL || "http://localhost:3002");
const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!clientId || !clientSecret) throw new Error("Google OAuth credentials are missing in .env.");
if (!["localhost", "127.0.0.1"].includes(base.hostname)) {
  throw new Error("This smoke test is restricted to a local Finova server.");
}

const timeout = () => AbortSignal.timeout(10000);
const read = (pathname, options = {}) => fetch(new URL(pathname, base), {
  redirect: "manual",
  signal: timeout(),
  ...options,
});

async function main() {
  const login = await read("/login");
  assert.equal(login.status, 200, "Login page must be accessible");
  const loginHtml = await login.text();
  assert.ok(loginHtml.includes("Tiếp tục với Google"), "Google login button is missing");
  assert.ok(!loginHtml.includes("Quản trị viên chưa cấu hình Google OAuth"),
    "Google sign-in must be enabled");

  const response = await read("/api/auth/sign-in/social", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base.origin },
    body: JSON.stringify({ provider: "google", callbackURL: "/onboarding", disableRedirect: true }),
  });
  assert.equal(response.status, 200, "OAuth initiation must succeed");
  const result = await response.json();
  assert.ok(result.url, "Google authorization URL missing");
  const authorization = new URL(result.url);
  assert.equal(authorization.origin, "https://accounts.google.com");
  assert.equal(authorization.pathname, "/o/oauth2/v2/auth");
  assert.equal(authorization.searchParams.get("client_id"), clientId);
  assert.equal(authorization.searchParams.get("redirect_uri"), base.origin + "/api/auth/callback/google");
  assert.equal(authorization.searchParams.get("response_type"), "code");
  assert.ok(authorization.searchParams.get("state"), "OAuth state is missing");
  const scopes = new Set((authorization.searchParams.get("scope") || "").split(" "));
  for (const scope of ["openid", "email", "profile"]) {
    assert.ok(scopes.has(scope), `Missing expected OAuth scope: ${scope}`);
  }
  const cookies = response.headers.getSetCookie?.() ?? [];
  assert.ok(cookies.some(cookie => /state/i.test(cookie) &&
    /httponly/i.test(cookie) && /samesite=lax/i.test(cookie)),
    "OAuth state must be stored in an HttpOnly SameSite=Lax cookie");

  const session = await read("/api/auth/get-session");
  assert.equal(session.status, 200);
  assert.equal(await session.json(), null, "Unauthenticated users must not receive a session");
  for (const route of ["/api/v1/wallets", "/api/v1/transactions", "/api/v1/reports/overview"]) {
    const result = await read(route);
    assert.equal(result.status, 401, `${route} must require authentication`);
    assert.match(result.headers.get("cache-control") || "", /no-store/);
  }
  for (const route of ["/dashboard", "/onboarding", "/wallets"]) {
    const result = await read(route);
    assert.equal(result.status, 307, `${route} must redirect unauthenticated users`);
    assert.equal(result.headers.get("location"), "/login");
  }
  console.log("PASS: Google OAuth initiation, callback URI, state cookie, scopes, auth guards and no-store headers.");

  if (process.argv.includes("--probe-google")) {
    const google = await fetch(authorization, { redirect: "manual", signal: timeout() });
    const text = await google.text();
    assert.ok([200, 302].includes(google.status), `Google authorization HTTP ${google.status}`);
    assert.ok(!/redirect_uri_mismatch|invalid_client|OAuth client was not found/i.test(text),
      "Google rejected the OAuth client or redirect URI");
    console.log("PASS: Google authorization endpoint responded without a recognized client/redirect error.");
  }
  console.log("NOTE: Successful Google account callback, session and authenticated browser E2E require user sign-in.");
}

main().catch((error) => {
  // Keep error messages generic: do not expose the authorization URL, cookies or secrets.
  console.error("FAIL: OAuth smoke:", error instanceof Error ? error.message : "Unknown error");
  process.exitCode = 1;
});
