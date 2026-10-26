/** AD5-06 browser acceptance: signed QA sessions, not real Google OAuth.
 * Test against a running local Next server using the SAME isolated Admin QA DB.
 */
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "../src/lib/db";
import { auth } from "../src/server/auth";
import { vietnamUsageDay } from "../src/modules/admin/usage-domain";

const base = new URL(process.env.FINOVA_BROWSER_URL ?? "http://localhost:31641");
assert.ok(["localhost", "127.0.0.1"].includes(base.hostname), "Local QA only");
assert.match(new URL(process.env.DATABASE_URL ?? "postgres://invalid/invalid").pathname,
  /^\/finova_admin_test_[A-Za-z0-9_]+$/, "An isolated Admin QA database is required");
assert.equal(process.env.FINOVA_ADMIN_ENABLED, "1", "Admin QA flag must be enabled");
assert.equal(process.env.FINOVA_USAGE_ANALYTICS_ENABLED, "1", "Usage dashboard QA flag must be enabled");
const browserExecutable = [process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome", "/usr/bin/chromium"].find(p => p && existsSync(p));
assert.ok(browserExecutable, "Chrome/Edge required");

const marker = randomUUID().replaceAll("-", "");
const users = Object.fromEntries(["admin", "analyst", "finance", "ordinary"].map(role =>
  [role, `qa_analytics_${role}_${marker}`])) as Record<"admin" | "analyst" | "finance" | "ordinary", string>;
const userIds = Object.values(users);
const tokens: string[] = [];
const orderIds: string[] = [];
let priceId: string | undefined;
let receiverId: string | undefined;
let chrome: ChildProcess | undefined;
let socket: WebSocket | undefined;
let profile = "";
let sequence = 0;
type CdpResult = { result?: { value?: unknown }; exceptionDetails?: { text: string }; success?: boolean };
const pending = new Map<number, { resolve: (value: CdpResult) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function cdp(method: string, params: object = {}): Promise<CdpResult> {
  assert.ok(socket, "Browser websocket unavailable");
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timeout`)); }, 20_000);
    pending.set(id, { resolve, reject, timer });
    socket!.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate<T>(expression: string): Promise<T> {
  const response = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error(`Chrome eval failed: ${response.exceptionDetails.text}`);
  return response.result?.value as T;
}
async function until<T>(fn: () => Promise<T>, name: string): Promise<T> {
  for (let attempt = 0; attempt < 130; attempt++) {
    try { const value = await fn(); if (value) return value; } catch { /* Navigating. */ }
    await sleep(180);
  }
  throw new Error(`Timed out: ${name}`);
}
async function navigate(route: string) {
  await cdp("Page.navigate", { url: new URL(route, base).href });
  await until(() => evaluate<boolean>("document.readyState === 'complete' && !!document.querySelector('h2.page-title')"), route);
}
async function setCookie(cookie: string) {
  await cdp("Network.clearBrowserCookies");
  const split = cookie.indexOf("=");
  const result = await cdp("Network.setCookie", { name: cookie.slice(0, split),
    value: decodeURIComponent(cookie.slice(split + 1)), url: base.href, path: "/", httpOnly: true, sameSite: "Lax" });
  assert.equal(result.success, true, "Signed QA cookie rejected by browser");
}
async function checkHttp(cookie: string, route: string, status: number) {
  const response = await fetch(new URL(route, base), { headers: { cookie }, redirect: "manual", cache: "no-store" });
  const html = await response.text();
  if (status === 403) {
    // Next 16 keeps HTTP 200 if a nested route calls forbidden() after the
    // parent shell has streamed. The forbidden boundary must still suppress
    // every protected page component (see Next's forbidden.md status rules).
    assert.ok(response.status === 403 || response.status === 200,
      `${route}: unexpected denied status ${response.status}`);
    assert.match(html, /Không có quyền truy cập/);
    assert.doesNotMatch(html, /<h2[^>]*class="page-title"/, "Forbidden page leaked analytics view");
  } else {
    assert.equal(response.status, status, `${route}: expected ${status}, got ${response.status}`);
    assert.match(html, /<h2[^>]*class="page-title"/, "Allowed role missing dashboard");
  }
}
const vnDate = (offset: number) => new Date(vietnamUsageDay(new Date()).getTime() - offset * 86400000);
const utcAtVnNoon = (offset: number) => new Date(vnDate(offset).getTime() + 5 * 3600000);

async function main() {
  const context = await auth.$context;
  const cookies: Record<string, string> = {};
  const issue = async (role: keyof typeof users) => {
    const token = randomUUID(); tokens.push(token);
    await prisma.session.create({ data: { id: randomUUID(), token, userId: users[role],
      createdAt: new Date(), expiresAt: new Date(Date.now() + 3600_000) } });
    const signature = createHmac("sha256", context.secret).update(token).digest("base64");
    cookies[role] = context.authCookies.sessionToken.name + "=" + encodeURIComponent(token + "." + signature);
  };
  try {
    await prisma.user.createMany({ data: userIds.map(id => ({ id, name: "QA analytics user", email: `${id}@example.test`, emailVerified: true })) });
    await prisma.systemRoleAssignment.createMany({ data: [
      { userId: users.admin, role: "ADMIN" }, { userId: users.analyst, role: "ANALYST" },
      { userId: users.finance, role: "FINANCE_OPERATOR" },
    ] });
    for (const role of Object.keys(users) as (keyof typeof users)[]) await issue(role);
    for (const [role, cookie] of Object.entries(cookies)) {
      const local = await auth.api.getSession({ headers: new Headers({ cookie }) });
      assert.equal(local?.user.id, users[role as keyof typeof users]);
      const remote = await fetch(new URL("/api/auth/get-session", base), { headers: { cookie }, cache: "no-store" });
      const json = await remote.json() as { user?: { id: string } };
      assert.equal(json.user?.id, users[role as keyof typeof users], "QA browser/server DB or secret mismatch for " + role);
    }

    for (const period of [7, 30, 90]) {
      for (const route of ["/admin/analytics", "/admin/billing/analytics"]) {
        const url = `${route}?days=${period}`;
        await checkHttp(cookies.ordinary, url, 403);
        await checkHttp(cookies.admin, url, 200);
        await checkHttp(cookies[route === "/admin/analytics" ? "analyst" : "finance"], url, 200);
      }
    }
    await checkHttp(cookies.analyst, "/admin/billing/analytics", 403);
    await checkHttp(cookies.finance, "/admin/analytics", 403);
    console.log("PASS: AD5-06 direct URL 7/30/90 signed RBAC (ADMIN/ANALYST/FINANCE_OPERATOR/USER)");

    await prisma.productUsageDaily.createMany({ data: [2, 20, 60].map((offset, i) => ({
      userId: users.ordinary, dayVn: vnDate(offset), pageViews: [3, 5, 7][i]!,
      firstSeenAt: utcAtVnNoon(offset), lastSeenAt: utcAtVnNoon(offset),
    })) });
    await prisma.subscriptionPlan.upsert({ where: { code: "PREMIUM" },
      create: { code: "PREMIUM", displayName: "Premium" }, update: {} });
    const price = await prisma.planPrice.create({ data: { planCode: "PREMIUM", productCode: `QA_DASH_${marker}`,
      billingPeriod: "MONTH", periodCount: 1, priceVnd: 29000, version: 1 } });
    priceId = price.id;
    const receiver = await prisma.billingReceivingAccount.create({ data: { bankCode: "QA", bankName: "QA ONLY",
      accountName: "QA ANALYTICS", accountNumberEncrypted: "QA_ONLY", accountNumberLast4: "0000",
      status: "DISABLED", createdBy: users.admin } });
    receiverId = receiver.id;
    for (const offset of [2, 20, 60]) {
      const order = await prisma.billingOrder.create({ data: {
        userId: users.ordinary, priceId: price.id, receiverAccountId: receiver.id,
        orderCode: `QA_DASH_${offset}_${marker}`, idempotencyKey: `qa_dash_${offset}_${marker}`,
        planCode: "PREMIUM", billingPeriodSnapshot: "MONTH", periodCountSnapshot: 1,
        amountDueVnd: 29000, createdAt: utcAtVnNoon(offset),
        expiresAt: new Date(Date.now() + 86400000), status: "PENDING_PAYMENT",
      } });
      orderIds.push(order.id);
    }

    profile = await mkdtemp(path.join(os.tmpdir(), "finova-analytics-"));
    chrome = spawn(browserExecutable!, ["--headless=new", ...(process.env.CI ? ["--no-sandbox"] : []),
      "--no-first-run", "--disable-extensions", "--disable-background-networking", "--remote-debugging-port=0",
      `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
    const port = await until(async () => {
      const file = path.join(profile, "DevToolsActivePort");
      return existsSync(file) ? Number((await readFile(file, "utf8")).split(/\r?\n/)[0]) : 0;
    }, "Chrome debugger");
    const tab = await until(async () => {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      return (await response.json() as Array<{ type: string; webSocketDebuggerUrl?: string }>).find(t => t.type === "page" && t.webSocketDebuggerUrl);
    }, "Chrome page");
    assert.ok(tab?.webSocketDebuggerUrl, "Chrome debugger page missing");
    socket = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      socket!.addEventListener("open", () => resolve(), { once: true });
      socket!.addEventListener("error", () => reject(new Error("Chrome websocket failed")), { once: true });
    });
    socket.addEventListener("message", event => {
      const msg = JSON.parse(String(event.data));
      const item = pending.get(msg.id);
      if (!item) return;
      pending.delete(msg.id); clearTimeout(item.timer);
      if (msg.error) item.reject(new Error(msg.error.message));
      else item.resolve(msg.result);
    });
    await cdp("Page.enable"); await cdp("Runtime.enable"); await cdp("Network.enable");
    const axe = await readFile(path.resolve("node_modules/axe-core/axe.min.js"), "utf8");

    for (const [route, role, heading] of [
      ["/admin/analytics", "analyst", "Thống kê truy cập"],
      ["/admin/billing/analytics", "finance", "Phân tích thu phí Premium"],
    ]) {
      await setCookie(cookies[role]);
      for (const { width, theme } of [
        { width: 1440, theme: "light" }, { width: 390, theme: "light" }, { width: 320, theme: "dark" },
      ]) {
        await cdp("Emulation.setDeviceMetricsOverride", { width, height: 850, mobile: width < 768, deviceScaleFactor: 1 });
        await navigate(`${route}?days=7`);
        await evaluate(`localStorage.setItem('finova-theme', ${JSON.stringify(theme)})`);
        for (const period of [7, 30, 90]) {
          await navigate(`${route}?days=${period}`);
          const state = await evaluate<{ width: number; viewport: number; title: string; theme: string;
            currentPeriod: string[]; rows: number; header: string; text: string; touchMin: number; tableWidth: number;
            tableViewport: number; detailOpen: boolean }>(`(() => {
              const periods = [...document.querySelectorAll('a[aria-current=page][href*="days="]')];
              const detail = document.querySelector('details'); const summary = detail?.querySelector('summary');
              const links = [...document.querySelectorAll('nav[aria-label^="Chọn khoảng thời gian"] a')];
              const table = detail?.querySelector('.table-wrap');
              return { width: document.documentElement.scrollWidth, viewport: innerWidth,
                title: document.querySelector('h2.page-title')?.textContent ?? '',
                theme: document.documentElement.dataset.theme,
                currentPeriod: periods.map(a => a.textContent.trim()),
                rows: document.querySelector('details')?.querySelectorAll('tbody tr').length ?? 0,
                header: document.querySelector('.admin-traffic-chart')?.getAttribute('aria-label') ?? '',
                text: document.querySelector('main')?.textContent ?? '',
                touchMin: Math.min(...links.map(a => a.getBoundingClientRect().height)),
                tableWidth: table?.scrollWidth ?? 0, tableViewport: table?.clientWidth ?? 0,
                detailOpen: !!detail?.open, summaryExists: !!summary };
            })()`);
          assert.equal(state.viewport, width);
          assert.ok(state.width <= width + 1, `${role} ${width}px ${period}d overflow: ${state.width}`);
          assert.equal(state.title, heading);
          assert.equal(state.theme, theme);
          assert.deepEqual(state.currentPeriod, [`${period} ngày`]);
          assert.equal(state.rows, period, `${role}: missing ${period} daily drill-down rows`);
          assert.ok(state.touchMin >= 44, `${role}: filter touch targets smaller than 44px`);
          assert.ok(state.tableViewport <= width, `${role}: table must scroll within viewport`);
          assert.ok(state.header.includes(`${period} ngày`), `${role}: chart aria label must disclose period`);
          assert.ok(!state.text.includes(users.ordinary) && !state.text.includes(marker), "Analytics exposed fixture PII/order codes");
          assert.ok(!state.detailOpen);
          // The summary must remain keyboard-operable; Enter opens the daily table.
          await evaluate(`document.querySelector('details summary').focus()`);
          await cdp("Input.dispatchKeyEvent", { type: "rawKeyDown", windowsVirtualKeyCode: 13,
            nativeVirtualKeyCode: 13, key: "Enter", code: "Enter" });
          await cdp("Input.dispatchKeyEvent", { type: "char", text: "\r", key: "Enter", code: "Enter" });
          await cdp("Input.dispatchKeyEvent", { type: "keyUp", windowsVirtualKeyCode: 13, key: "Enter", code: "Enter" });
          const opened = await evaluate<boolean>("document.querySelector('details').open");
          if (!opened) {
            const diagnostic = await evaluate<string>(`(() => {
              const a = document.activeElement;
              return a?.tagName + '/' + a?.textContent?.slice(0, 40) + ', focused=' + (a === document.querySelector('details summary'));
            })()`);
            throw new Error(`Keyboard drill-down failed: ${diagnostic}`);
          }
          if (period === 7) {
            await evaluate(axe);
            const violations = await evaluate<Array<{ id: string; impact: string }>>(`axe.run(document,
              { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa'] } })
              .then(r => r.violations.map(v => ({ id: v.id, impact: v.impact })))`);
            assert.deepEqual(violations.filter(v => v.impact === "serious" || v.impact === "critical"), [],
              `${role} ${width}px ${theme}: axe WCAG serious/critical violations`);
          }
        }
        console.log(`PASS: ${role} ${width}px ${theme}, 7/30/90 daily drill-down, responsive, keyboard, axe`);
      }
    }
    console.log("ADMIN_ANALYTICS_BROWSER_QA_PASS: AD5-06 signed-session browser acceptance");
  } finally {
    socket?.close(); chrome?.kill();
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error("Browser stopped")); }
    if (profile) await rm(profile, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
    await prisma.billingOrder.deleteMany({ where: { id: { in: orderIds } } });
    if (receiverId) await prisma.billingReceivingAccount.deleteMany({ where: { id: receiverId } });
    if (priceId) await prisma.planPrice.deleteMany({ where: { id: priceId } });
    await prisma.productUsageDaily.deleteMany({ where: { userId: { in: userIds } } });
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
    assert.equal(await prisma.user.count({ where: { id: { in: userIds } } }), 0, "Browser fixtures remain");
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
