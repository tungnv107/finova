/** Real HTTP + Chrome acceptance for Lite self-registration and Super Admin review.
 * Run only against a disposable finova_admin_test_* DB with a matching local Next server.
 * Synthetic signed sessions do not test Google OAuth or external payment verification.
 */
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { auth } from "../src/server/auth";
import { prisma } from "../src/lib/db";
import { getEffectiveSubscription, requirePremiumFeature } from "../src/server/premium";

const base = new URL(process.env.FINOVA_BROWSER_URL ?? "http://localhost:3017");
assert.ok(["localhost", "127.0.0.1"].includes(base.hostname), "Local browser QA only");
assert.match(new URL(process.env.DATABASE_URL ?? "postgres://invalid/invalid").pathname,
  /^\/finova_admin_test_[A-Za-z0-9_]+$/, "Dedicated QA database required");
assert.equal(process.env.FINOVA_ADMIN_ENABLED, "1");
assert.equal(process.env.FINOVA_PREMIUM_ENTITLEMENTS_ENFORCED, "1");
const browserExecutable = [process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome", "/usr/bin/chromium"].find(p => p && existsSync(p));
assert.ok(browserExecutable, "Chrome/Edge required");

const marker = randomUUID().replaceAll("-", "");
const users = { lite: `qa_pr_lite_${marker}`, rejected: `qa_pr_rejected_${marker}`,
  admin: `qa_pr_admin_${marker}`, super: `qa_pr_super_${marker}` };
const userIds = Object.values(users);
const tokens: string[] = [];
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
let chrome: ChildProcess | undefined;
let socket: WebSocket | undefined;
let profile = "";
let commandId = 0;
type CdpResult = { result?: { value?: unknown }; exceptionDetails?: { text: string }; success?: boolean };
const pending = new Map<number, { resolve: (result: CdpResult) => void;
  reject: (error: Error) => void; timer: NodeJS.Timeout }>();

function cdp(method: string, params: object = {}): Promise<CdpResult> {
  assert.ok(socket, "Chrome connection required");
  const id = ++commandId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 20_000);
    pending.set(id, { resolve, reject, timer });
    socket!.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate<T = unknown>(expression: string): Promise<T> {
  const response = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error(`Browser evaluation failed: ${response.exceptionDetails.text}`);
  return response.result?.value as T;
}
async function until<T>(fn: () => Promise<T>, label: string): Promise<T> {
  for (let i = 0; i < 100; i++) {
    try { const result = await fn(); if (result) return result; } catch { /* Navigation may be in progress. */ }
    await delay(170);
  }
  throw new Error(`Timeout waiting for ${label}`);
}
async function navigate(route: string, selector: string) {
  await cdp("Page.navigate", { url: new URL(route, base).href });
  await until(() => evaluate<boolean>(`document.readyState === 'complete' && !!document.querySelector(${JSON.stringify(selector)})`), route);
}
async function setCookie(cookie: string) {
  await cdp("Network.clearBrowserCookies");
  const eq = cookie.indexOf("=");
  const result = await cdp("Network.setCookie", {
    name: cookie.slice(0, eq), value: decodeURIComponent(cookie.slice(eq + 1)),
    url: base.href, path: "/", httpOnly: true, sameSite: "Lax",
  });
  assert.equal(result.success, true, "Browser QA cookie rejected");
}
async function request(cookie: string | undefined, route: string, method = "GET", body?: unknown, origin = base.origin) {
  return fetch(new URL(route, base), {
    method, redirect: "manual", headers: {
      ...(cookie ? { cookie } : {}), ...(method !== "GET" ? { origin, "Content-Type": "application/json" } : {}),
    }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function main() {
  const context = await auth.$context;
  async function issue(userId: string) {
    const token = randomUUID();
    tokens.push(token);
    await prisma.session.create({ data: { id: randomUUID(), token, userId,
      createdAt: new Date(), expiresAt: new Date(Date.now() + 3600_000) } });
    const signature = createHmac("sha256", context.secret).update(token).digest("base64");
    return `${context.authCookies.sessionToken.name}=${encodeURIComponent(`${token}.${signature}`)}`;
  }
  try {
    await prisma.user.createMany({ data: userIds.map(id => ({ id,
      name: "Premium Registration QA", email: `${id}@example.test`, emailVerified: true })) });
    await prisma.systemRoleAssignment.createMany({ data: [
      { userId: users.admin, role: "ADMIN" }, { userId: users.super, role: "SUPER_ADMIN" },
    ] });
    const [lite, rejected, admin, superAdmin] = await Promise.all([
      issue(users.lite), issue(users.rejected), issue(users.admin), issue(users.super),
    ]);
    for (const [role, cookie, id] of [
      ["lite", lite, users.lite], ["rejected", rejected, users.rejected],
      ["admin", admin, users.admin], ["super", superAdmin, users.super],
    ]) {
      assert.equal((await auth.api.getSession({ headers: new Headers({ cookie }) }))?.user.id, id, `${role}: invalid local session`);
      const session = await request(cookie, "/api/auth/get-session");
      assert.equal((await session.json() as { user?: { id: string } }).user?.id, id, `${role}: server session mismatch`);
    }
    assert.deepEqual(await getEffectiveSubscription(users.super), { plan: "PREMIUM", expiresAt: null });
    assert.equal((await getEffectiveSubscription(users.lite)).plan, "LITE");
    await assert.rejects(requirePremiumFeature(users.lite, "STATEMENT_IMPORT"), { status: 403, code: "PREMIUM_REQUIRED" });
    await assert.rejects(requirePremiumFeature(users.lite, "BANK_SYNC"), { status: 403, code: "PREMIUM_REQUIRED" });
    await assert.rejects(requirePremiumFeature(users.lite, "NOTIFICATIONS"), { status: 403, code: "PREMIUM_REQUIRED" });
    await requirePremiumFeature(users.super, "STATEMENT_IMPORT");
    await requirePremiumFeature(users.super, "BANK_SYNC");
    await requirePremiumFeature(users.super, "NOTIFICATIONS");
    assert.equal((await request(lite, "/admin/subscriptions")).status, 403);
    assert.equal((await request(admin, "/admin/subscriptions")).status, 200);
    assert.equal((await request(superAdmin, "/admin/subscriptions")).status, 200);
    assert.equal((await request(lite, "/settings/subscription")).status, 200);
    assert.equal((await request(superAdmin, "/settings/subscription")).status, 200);
    const invalid = { period: "YEAR", idempotencyKey: `qa_${marker}` };
    assert.equal((await request(lite, "/api/v1/me/premium-registrations", "POST", invalid, "https://invalid.example")).status, 403);
    assert.equal((await request(undefined, "/api/v1/me/premium-registrations", "POST", invalid)).status, 401);
    console.log("PASS: real signed sessions; Super Admin perpetual Premium; Lite gating; page/CSRF RBAC");

    profile = await mkdtemp(path.join(os.tmpdir(), "finova-premium-qa-"));
    chrome = spawn(browserExecutable!, ["--headless=new", ...(process.env.CI ? ["--no-sandbox"] : []),
      "--no-first-run", "--no-default-browser-check", "--disable-extensions",
      "--disable-background-networking", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
      "about:blank"], { stdio: "ignore" });
    const port = await until(async () => {
      const filename = path.join(profile, "DevToolsActivePort");
      return existsSync(filename) ? Number((await readFile(filename, "utf8")).split(/\r?\n/)[0]) : 0;
    }, "Chrome debugger");
    const tab = await until(async () => {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const tabs: Array<{ type: string; webSocketDebuggerUrl?: string }> = await res.json();
      return tabs.find(t => t.type === "page" && t.webSocketDebuggerUrl);
    }, "Chrome tab");
    assert.ok(tab?.webSocketDebuggerUrl, "Chrome tab WebSocket unavailable");
    socket = new WebSocket(tab.webSocketDebuggerUrl!);
    await new Promise<void>((resolve, reject) => {
      socket!.addEventListener("open", () => resolve(), { once: true });
      socket!.addEventListener("error", () => reject(new Error("Chrome websocket error")), { once: true });
    });
    socket.addEventListener("message", event => {
      const msg = JSON.parse(String(event.data));
      const wait = pending.get(msg.id);
      if (!wait) return;
      pending.delete(msg.id); clearTimeout(wait.timer);
      if (msg.error) wait.reject(new Error(msg.error.message)); else wait.resolve(msg.result);
    });
    await cdp("Page.enable"); await cdp("Runtime.enable"); await cdp("Network.enable");
    const axe = await readFile(path.resolve("node_modules/axe-core/axe.min.js"), "utf8");
    async function visualCheck(route: string, selector: string, width: number, theme: string) {
      await cdp("Emulation.setDeviceMetricsOverride", { width, height: 850, mobile: width < 768, deviceScaleFactor: 1 });
      await navigate(route, selector);
      await evaluate(`localStorage.setItem('finova-theme', ${JSON.stringify(theme)})`);
      await navigate(route, selector);
      assert.ok((await evaluate<number>("document.documentElement.scrollWidth")) <= width + 1,
        `${route} ${width}: page overflows horizontally`);
      assert.equal(await evaluate<string>("document.documentElement.dataset.theme"), theme);
      await evaluate(axe);
      const severe = await evaluate<Array<{ id: string; impact: string }>>(`axe.run(document,
        { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa'] } })
        .then(r => r.violations.filter(v => ['serious','critical'].includes(v.impact))
          .map(v => ({ id: v.id, impact: v.impact })))`);
      assert.deepEqual(severe, [], `${route} ${width} ${theme}: severe WCAG violations`);
    }
    await setCookie(lite);
    await visualCheck("/settings/subscription", ".subscription-page", 390, "light");
    assert.equal(await evaluate<boolean>("!!document.querySelector('form.premium-registration-form button:not([disabled])')"), true);
    await evaluate(`(() => {
      const select = document.querySelector('#premium-register-period');
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setter.call(select, 'YEAR'); select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    await until(() => evaluate<boolean>("document.querySelector('#premium-register-period')?.value === 'YEAR'"), "annual selection");
    await evaluate("document.querySelector('form.premium-registration-form').requestSubmit()");
    const application = await until(() => prisma.subscriptionActionRequest.findFirst({ where: {
      userId: users.lite, requestedBy: users.lite, status: "PENDING",
    } }), "submitted browser registration");
    assert.ok(application, "No Premium application created");
    assert.equal(application.billingPeriod, "YEAR");
    await until(() => evaluate<boolean>("document.body.innerText.includes('Chờ Super Admin duyệt')"), "visible request status");
    assert.equal((await prisma.subscriptionGrant.count({ where: { userId: users.lite } })), 0);
    assert.equal((await prisma.billingOrder.count({ where: { userId: users.lite } })), 0);
    assert.equal((await request(lite, "/api/v1/me/premium-registrations", "POST", {
      period: "YEAR", idempotencyKey: application.idempotencyKey })).status, 201);
    const duplicate = await request(lite, "/api/v1/me/premium-registrations", "POST", {
      period: "MONTH", idempotencyKey: `another_${marker}` });
    assert.equal(duplicate.status, 409);
    assert.equal((await duplicate.json() as { error: { code: string } }).error.code, "REGISTRATION_PENDING");
    const own = await request(lite, "/api/v1/me/premium-registrations");
    assert.equal((await own.json() as { data: Array<{ id: string }> }).data[0].id, application.id);
    const other = await request(rejected, "/api/v1/me/premium-registrations");
    assert.deepEqual((await other.json() as { data: unknown[] }).data, []);
    console.log("PASS: hydrated Lite form, annual registration, idempotency, no grant/payment, owner scoping");

    assert.equal((await request(admin, `/api/v1/admin/subscriptions/actions/${application.id}/decision`, "POST",
      { decision: "APPROVE", reason: "Đã đối chiếu chứng từ thanh toán ngoài hệ thống." })).status, 403);
    await setCookie(superAdmin);
    await visualCheck("/admin/subscriptions", ".admin-shell", 1440, "light");
    await visualCheck("/admin/subscriptions", ".admin-shell", 320, "dark");
    assert.ok((await evaluate<string>("document.body.innerText")).includes(users.lite), "Review queue missing Lite applicant");
    const reasonSelector = `#review-reason-${application.id}`;
    const reason = "Đã đối chiếu thanh toán thực tế ngoài hệ thống, duyệt gói năm.";
    await evaluate(`(() => {
      const field = document.querySelector(${JSON.stringify(reasonSelector)});
      if (!(field instanceof HTMLTextAreaElement)) throw new Error('Review field missing');
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(field, ${JSON.stringify(reason)});
      field.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await until(() => evaluate<boolean>(`!document.querySelector(${JSON.stringify(reasonSelector)})?.closest('.admin-access-form')?.querySelector('button.button-primary')?.disabled`),
      "review button enabled");
    await evaluate(`document.querySelector(${JSON.stringify(reasonSelector)}).closest('.admin-access-form').querySelector('button.button-primary').click()`);
    await until(async () => (await prisma.subscriptionActionRequest.findUnique({ where: { id: application.id } }))?.status === "APPROVED", "review approved");
    const grant = await prisma.subscriptionGrant.findFirst({ where: { userId: users.lite, revokedAt: null } });
    assert.ok(grant && grant.billingPeriod === "YEAR" && grant.grantType === "MANUAL");
    assert.equal((await getEffectiveSubscription(users.lite)).plan, "PREMIUM");
    await requirePremiumFeature(users.lite, "STATEMENT_IMPORT");
    await requirePremiumFeature(users.lite, "BANK_SYNC");
    await requirePremiumFeature(users.lite, "NOTIFICATIONS");
    assert.equal(await prisma.billingOrder.count({ where: { userId: users.lite } }), 0);
    await setCookie(lite);
    await visualCheck("/settings/subscription", ".subscription-page", 320, "dark");
    const page = await evaluate<string>("document.body.innerText");
    assert.ok(page.includes("Finova Premium") && page.includes("Đã duyệt"), "Premium entitlement/history missing in UI");
    console.log("PASS: Super Admin browser decision grants Premium, persists audit/history, unlocks Lite features");

    const rejectedApplication = await request(rejected, "/api/v1/me/premium-registrations", "POST", {
      period: "MONTH", idempotencyKey: `reject_${marker}` });
    assert.equal(rejectedApplication.status, 201);
    const rejectedId = (await rejectedApplication.json() as { data: { id: string } }).data.id;
    const rejectResult = await request(superAdmin, `/api/v1/admin/subscriptions/actions/${rejectedId}/decision`, "POST",
      { decision: "REJECT", reason: "Chưa xác minh được khoản thanh toán tương ứng." });
    assert.equal(rejectResult.status, 200);
    assert.equal((await getEffectiveSubscription(users.rejected)).plan, "LITE");
    assert.equal(await prisma.subscriptionGrant.count({ where: { userId: users.rejected } }), 0);
    assert.equal((await prisma.subscriptionActionRequest.findUniqueOrThrow({ where: { id: rejectedId } })).status, "REJECTED");
    assert.ok(await prisma.adminAuditLog.count({ where: { actorId: users.super,
      action: { in: ["SUBSCRIPTION_ACTION_APPROVED", "SUBSCRIPTION_ACTION_REJECTED"] } } }) >= 2);
    console.log("ADMIN_PREMIUM_REGISTRATION_BROWSER_QA_PASS: approve/reject, mobile, axe, entitlements, audit");
  } finally {
    socket?.close(); chrome?.kill();
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error("Browser closed")); }
    if (profile) await rm(profile, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
    await prisma.subscriptionEvent.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.subscriptionActionRequest.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.subscriptionGrant.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.adminAuditLog.deleteMany({ where: { actorId: { in: userIds } } });
    for (const userId of userIds) {
      const workspaceId = `personal-${userId}`;
      await prisma.category.deleteMany({ where: { workspaceId } });
      await prisma.ledgerAccount.deleteMany({ where: { workspaceId } });
      await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    }
    await prisma.subscription.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.systemRoleAssignment.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    assert.equal(await prisma.user.count({ where: { id: { in: userIds } } }), 0, "Fixture cleanup incomplete");
  }
}
main().catch(err => { console.error(err); process.exitCode = 1; }).finally(() => prisma.$disconnect());
