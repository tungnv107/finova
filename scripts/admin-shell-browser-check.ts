/** Browser acceptance for AD4-01. Signed synthetic QA sessions, never Google OAuth E2E.
 * Requires a locally running Next server against the SAME finova_admin_test_* DB.
 * Example: FINOVA_BROWSER_URL=http://localhost:3017 npm run admin:test-shell-browser
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

const base = new URL(process.env.FINOVA_BROWSER_URL ?? "http://localhost:3017");
assert.ok(["localhost", "127.0.0.1"].includes(base.hostname), "Only local browser QA allowed");
assert.match(new URL(process.env.DATABASE_URL ?? "postgres://invalid/invalid").pathname,
  /^\/finova_admin_test_[A-Za-z0-9_]+$/, "Browser fixture requires an isolated Admin QA database");
assert.equal(process.env.FINOVA_ADMIN_ENABLED, "1", "Admin flag must be enabled on QA server and test");
const browserExecutable = [process.env.CHROME_PATH,
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"].find(p => p && existsSync(p));
assert.ok(browserExecutable, "Chrome/Edge executable missing");

const marker = randomUUID().replaceAll("-", "");
const users = {
  admin: `qabr_admin_${marker}`,
  analyst: `qabr_analyst_${marker}`,
  ordinary: `qabr_user_${marker}`,
};
const userIds = Object.values(users);
const tokens: string[] = [];
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
let chrome: ChildProcess | undefined;
let socket: WebSocket | undefined;
let commandId = 0;
type CdpResult = { result?: { value?: unknown }; exceptionDetails?: { text: string }; success?: boolean };
const pending = new Map<number, { resolve: (value: CdpResult) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
let profile = "";

function cdp(method: string, params: object = {}): Promise<CdpResult> {
  if (!socket) throw new Error("Chrome not connected");
  const id = ++commandId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 20_000);
    pending.set(id, { resolve, reject, timer });
    socket!.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate<T = unknown>(expression: string): Promise<T> {
  const result = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(`Chrome evaluation: ${result.exceptionDetails.text}`);
  return result.result?.value as T;
}
async function until<T>(fn: () => Promise<T>, label: string): Promise<T> {
  for (let i = 0; i < 100; i++) {
    try { const value = await fn(); if (value) return value; } catch { /* Navigation in flight. */ }
    await delay(170);
  }
  throw new Error(`Timeout waiting for ${label}`);
}
async function navigate(route: string) {
  await cdp("Page.navigate", { url: new URL(route, base).href });
  await until(() => evaluate<boolean>("document.readyState === 'complete' && !!document.querySelector('.admin-shell')"), route);
}
async function setCookie(cookie: string) {
  await cdp("Network.clearBrowserCookies");
  const index = cookie.indexOf("=");
  const result = await cdp("Network.setCookie", {
    name: cookie.slice(0, index), value: decodeURIComponent(cookie.slice(index + 1)), url: base.href,
    path: "/", httpOnly: true, sameSite: "Lax",
  });
  assert.equal(result.success, true, "Signed QA cookie accepted by Chrome");
}

async function main() {
  const context = await auth.$context;
  async function issue(userId: string) {
    const token = randomUUID();
    tokens.push(token);
    await prisma.session.create({ data: {
      id: randomUUID(), token, userId, createdAt: new Date(),
      expiresAt: new Date(Date.now() + 3600_000),
    } });
    const signature = createHmac("sha256", context.secret).update(token).digest("base64");
    return `${context.authCookies.sessionToken.name}=${encodeURIComponent(`${token}.${signature}`)}`;
  }
  try {
    await prisma.user.createMany({ data: userIds.map(id => ({
      id, name: "Finova Admin Browser QA", email: `${id}@example.test`, emailVerified: true,
    })) });
    await prisma.systemRoleAssignment.createMany({ data: [
      { userId: users.admin, role: "ADMIN" }, { userId: users.analyst, role: "ANALYST" },
    ] });
    const [admin, analyst, ordinary] = await Promise.all([
      issue(users.admin), issue(users.analyst), issue(users.ordinary),
    ]);
    const checkHttp = async (cookie: string, url: string, status: number, forbiddenText = false) => {
      const response = await fetch(new URL(url, base), { headers: { cookie }, redirect: "manual" });
      const html = await response.text();
      assert.equal(response.status, status, `${url}: expected HTTP ${status}`);
      if (forbiddenText) {
        // Dev RSC error payloads contain component source/stack traces. Check the
        // rendered HTML boundary, where protected admin markup must never appear.
        assert.match(html, /Không có quyền truy cập/, "Denied request must render the 403 boundary");
        assert.doesNotMatch(html, /<(?:section|nav)\b[^>]*class="[^"]*\badmin-(?:shell|tabs)\b/,
          "Denied request must not render protected admin UI");
      }
    };
    await checkHttp(ordinary, "/admin", 403, true);
    await checkHttp(ordinary, "/admin/users", 403, true);
    await checkHttp(analyst, "/admin/users", 403, true);
    await checkHttp(analyst, "/admin/billing/payments", 403, true);
    await checkHttp(admin, "/admin", 200);
    console.log("PASS: direct URL 403 and privileged content absent for non-admin/analyst");

    profile = await mkdtemp(path.join(os.tmpdir(), "finova-admin-shell-"));
    chrome = spawn(browserExecutable!, ["--headless=new", ...(process.env.CI ? ["--no-sandbox"] : []),
      "--no-first-run", "--no-default-browser-check",
      "--disable-extensions", "--disable-background-networking", "--remote-debugging-port=0",
      `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
    const port = await until(async () => {
      const target = path.join(profile, "DevToolsActivePort");
      if (!existsSync(target)) return 0;
      return Number((await readFile(target, "utf8")).split(/\r?\n/)[0]);
    }, "Chrome debugger");
    const tab = await until(async () => {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const tabs: Array<{ type: string; webSocketDebuggerUrl?: string }> = await response.json();
      return tabs.find(item => item.type === "page" && item.webSocketDebuggerUrl);
    }, "Chrome page");
    assert.ok(tab?.webSocketDebuggerUrl, "Chrome tab not found");
    socket = new WebSocket(tab.webSocketDebuggerUrl!);
    await new Promise<void>((resolve, reject) => {
      socket!.addEventListener("open", () => resolve(), { once: true });
      socket!.addEventListener("error", () => reject(new Error("Chrome websocket error")), { once: true });
    });
    socket.addEventListener("message", event => {
      const message = JSON.parse(String(event.data));
      const waiting = pending.get(message.id);
      if (!waiting) return;
      pending.delete(message.id);
      clearTimeout(waiting.timer);
      if (message.error) waiting.reject(new Error(message.error.message));
      else waiting.resolve(message.result);
    });
    await cdp("Page.enable"); await cdp("Runtime.enable"); await cdp("Network.enable");
    const axe = await readFile(path.resolve("node_modules/axe-core/axe.min.js"), "utf8");
    for (const { role, cookie, expectedLinks, missingLinks } of [
      { role: "admin", cookie: admin, expectedLinks: ["/admin/users", "/admin/billing/payments"], missingLinks: [] },
      { role: "analyst", cookie: analyst, expectedLinks: ["/admin/analytics"], missingLinks: ["/admin/users", "/admin/billing/payments"] },
    ]) {
      await setCookie(cookie);
      for (const { width, theme } of [
        { width: 1440, theme: "light" }, { width: 390, theme: "light" },
        { width: 320, theme: "dark" },
      ]) {
        await cdp("Emulation.setDeviceMetricsOverride", { width, height: 850, mobile: width < 768, deviceScaleFactor: 1 });
        await cdp("Page.navigate", { url: new URL("/admin", base).href });
        await until(() => evaluate<boolean>("document.readyState === 'complete' && !!document.querySelector('.admin-shell')"), "admin ready");
        await evaluate(`localStorage.setItem('finova-theme', ${JSON.stringify(theme)})`);
        await navigate("/admin");
        const measurements = await evaluate<{
          pageWidth: number; viewport: number; linkTargets: string[]; heading: string;
          navigationWidth: number; navigationViewport: number; theme: string; touchHeight: number;
        }>(`(() => { const nav = document.querySelector('.admin-tabs'); const links = [...nav.querySelectorAll('a')];
          return { pageWidth: document.documentElement.scrollWidth, viewport: innerWidth,
            linkTargets: links.map(link => link.getAttribute('href')),
            heading: document.querySelector('.admin-banner h1')?.textContent,
            navigationWidth: nav.scrollWidth, navigationViewport: nav.clientWidth,
            theme: document.documentElement.dataset.theme,
            touchHeight: Math.min(...[...nav.querySelectorAll('summary, a')].filter(el => el.getClientRects().length > 0).map(el => el.getBoundingClientRect().height)) }; })()`);
        assert.equal(measurements.viewport, width);
        assert.ok(measurements.pageWidth <= width + 1, `${role} ${width}: page overflow (${measurements.pageWidth})`);
        assert.equal(measurements.heading, "Trung tâm quản trị");
        assert.equal(measurements.theme, theme);
        assert.ok(measurements.touchHeight >= 44, "Admin navigation touch target <44px");
        for (const href of expectedLinks) assert.ok(measurements.linkTargets.includes(href), `${role}: missing ${href}`);
        for (const href of missingLinks) assert.ok(!measurements.linkTargets.includes(href), `${role}: unauthorized ${href}`);
        if (width <= 390) assert.ok(measurements.navigationViewport <= width,
          "Admin menu must scroll inside its own container");
        await evaluate(axe);
        const violations = await evaluate<Array<{ id: string; impact: string; targets: Array<{ selector: string[]; issue?: string }> }>>(`axe.run(document,
          { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa'] } })
          .then(r => r.violations.map(v => ({ id: v.id, impact: v.impact, targets: v.nodes.slice(0, 12).map(n => ({ selector: n.target, issue: n.failureSummary })) })))`);
        assert.deepEqual(violations.filter(item => ["serious", "critical"].includes(item.impact)), [],
          `${role} ${width} ${theme}: serious WCAG violations`);
        console.log(`PASS: ${role} ${width}px ${theme}, nav, overflow, axe WCAG`);
      }
    }
    console.log("ADMIN_SHELL_BROWSER_QA_PASS: signed sessions, direct URLs, role menu, mobile, theme, axe");
  } finally {
    socket?.close(); chrome?.kill();
    for (const waiting of pending.values()) { clearTimeout(waiting.timer); waiting.reject(new Error("Browser shutdown")); }
    if (profile) await rm(profile, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
    // Workspace is seeded automatically by the authenticated protected layout.
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
    assert.equal(await prisma.user.count({ where: { id: { in: userIds } } }), 0, "QA fixtures removed");
  }
}
main().catch(err => { console.error(err); process.exitCode = 1; }).finally(() => prisma.$disconnect());
