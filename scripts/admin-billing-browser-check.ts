/** Browser acceptance for AD2-07. Signed synthetic QA sessions, never Google OAuth E2E.
 * Requires a locally running Next server against the SAME finova_admin_test_* DB.
 * Requires FINOVA_ADMIN_ENABLED=1, FINOVA_BILLING_CHECKOUT_ENABLED=1, and a QA encryption key.
 * Catalog versions published in the disposable QA database are intentionally retained.
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
import { seedPremiumCatalogAndLiteSubscriptions } from "../src/modules/billing/seed";
import { createBillingOrder, verifyBillingReceivingAccount } from "../src/modules/billing/service";

const base = new URL(process.env.FINOVA_BROWSER_URL ?? "http://localhost:3017");
assert.ok(["localhost", "127.0.0.1"].includes(base.hostname), "Only local browser QA allowed");
assert.match(new URL(process.env.DATABASE_URL ?? "postgres://invalid/invalid").pathname,
  /^\/finova_admin_test_[A-Za-z0-9_]+$/, "Browser fixture requires an isolated Admin QA database");
assert.equal(process.env.FINOVA_ADMIN_ENABLED, "1", "Admin flag must be enabled on QA server and test");
assert.equal(process.env.FINOVA_BILLING_CHECKOUT_ENABLED, "1", "QA checkout flag required for price snapshot tests");
assert.match(process.env.FINOVA_BILLING_ENCRYPTION_KEY ?? "", /^[a-f0-9]{64}$/i, "QA encryption key required");
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
  superA: `qabr_supera_${marker}`,
  superB: `qabr_superb_${marker}`,
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
  const qaPriceBefore = await prisma.planPrice.count({ where: { planCode: "PREMIUM" } });
  await seedPremiumCatalogAndLiteSubscriptions();
  const originalPrice = await prisma.planPrice.findFirst({
    where: { productCode: "PREMIUM_MONTHLY", isPublished: true },
  });
  assert.ok(originalPrice, "Seeded monthly Premium price required");
  let createdPriceId: string | undefined;
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
      { userId: users.superA, role: "SUPER_ADMIN" }, { userId: users.superB, role: "SUPER_ADMIN" },
    ] });
    const [admin, analyst, ordinary, superA, superB] = await Promise.all([
      issue(users.admin), issue(users.analyst), issue(users.ordinary), issue(users.superA), issue(users.superB),
    ]);
    // Validate the signed fixture in both processes before interpreting an
    // /admin redirect as an RBAC failure. The web server may have a different
    // Better Auth secret, database, cookie prefix or app origin.
    for (const [role, cookie, expectedId] of [
      ["ADMIN", admin, users.admin], ["ANALYST", analyst, users.analyst],
      ["USER", ordinary, users.ordinary], ["SUPER_A", superA, users.superA],
      ["SUPER_B", superB, users.superB],
    ] as const) {
      const local = await auth.api.getSession({ headers: new Headers({ cookie }) });
      assert.equal(local?.user.id, expectedId, `${role}: local signed session invalid`);
      const remote = await fetch(new URL("/api/auth/get-session", base), {
        headers: { cookie }, redirect: "manual", cache: "no-store",
      });
      const remoteText = await remote.text();
      let remoteUserId: string | undefined;
      try { remoteUserId = (JSON.parse(remoteText) as { user?: { id?: string } }).user?.id; }
      catch { /* Keep the diagnostic free of session tokens and user data. */ }
      assert.equal(remoteUserId, expectedId,
        `${role}: QA server auth mismatch (HTTP ${remote.status}, redirect ${remote.headers.get("location") ?? "none"}); verify same QA DB, Better Auth secret, origin and cookie name`);
    }
    const checkHttp = async (cookie: string, url: string, status: number, forbiddenText = false) => {
      const response = await fetch(new URL(url, base), { headers: { cookie }, redirect: "manual" });
      const html = await response.text();
      assert.equal(response.status, status,
        `${url}: expected HTTP ${status}; actual ${response.status}; redirect ${response.headers.get("location") ?? "none"}`);
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
    for (const route of ["/admin/billing/prices", "/admin/billing/accounts"]) {
      await checkHttp(ordinary, route, 403, true);
      await checkHttp(analyst, route, 403, true);
      await checkHttp(admin, route, 200);
      await checkHttp(superA, route, 200);
    }
    await checkHttp(admin, "/admin", 200);
    console.log("PASS: AD2-07 direct URL role matrix");
    const api = (cookie: string, route: string, method = "GET", body?: object) => fetch(new URL(route, base), {
      method, headers: {
        cookie, origin: base.origin, ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    for (const url of ["/api/v1/admin/billing/prices", "/api/v1/admin/billing/receiving-accounts"]) {
      assert.equal((await api(ordinary, url)).status, 403);
      assert.equal((await api(analyst, url)).status, 403);
      assert.equal((await api(admin, url)).status, 200);
    }

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
        const violations = await evaluate<Array<{ id: string; impact: string }>>(`axe.run(document,
          { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa'] } })
          .then(r => r.violations.map(v => ({ id: v.id, impact: v.impact })))`);
        assert.deepEqual(violations.filter(item => ["serious", "critical"].includes(item.impact)), [],
          `${role} ${width} ${theme}: serious WCAG violations`);
        console.log(`PASS: ${role} ${width}px ${theme}, nav, overflow, axe WCAG`);
      }
    }
    // Exercise the account form in a hydrated browser. The value submitted must
    // match the confirmed snapshot even if autofill changes the form silently.
    await setCookie(admin);
    await navigate("/admin/billing/accounts");
    const fill = async (selector: string, value: string) => evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!(element instanceof HTMLInputElement)) throw new Error('Field unavailable');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, ${JSON.stringify(value)});
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    const accountOriginal = "987654321234";
    const accountAutofill = "987654325678";
    await fill("#bank-code", "VCB");
    await fill("#bank-name", "Ngân hàng QA");
    await fill("#account-holder", "FINOVA QA RECEIVER");
    await fill("#account-number", accountOriginal);
    await evaluate(`document.querySelector('.admin-account-form button[type=submit]').click()`);
    await until(() => evaluate<boolean>("!!document.querySelector('[aria-label=\"Xem trước tài khoản nhận phí\"]')"), "receiver preview");
    const receiverPreview = await evaluate<string>("document.querySelector('[aria-label=\"Xem trước tài khoản nhận phí\"]').innerText");
    assert.ok(receiverPreview.includes("••••1234") && !receiverPreview.includes(accountOriginal),
      "Masked preview must hide account number");
    // Intentionally change DOM without an event to model password manager/autofill.
    await evaluate(`document.querySelector('#account-number').value = ${JSON.stringify(accountAutofill)}`);
    await evaluate(`document.querySelector('.admin-account-form button[type=submit]').click()`);
    const receiver = await until(async () => prisma.billingReceivingAccount.findFirst({
      where: { createdBy: users.admin }, orderBy: { createdAt: "desc" },
    }), "receiver proposal saved");
    assert.ok(receiver, "Receiver proposal missing");
    assert.equal(receiver.accountNumberLast4, "1234", "Confirmed receiver snapshot must be submitted");
    assert.equal(receiver.status, "PENDING_APPROVAL");
    assert.equal((await api(admin, `/api/v1/admin/billing/receiving-accounts/${receiver.id}/approve`, "POST")).status, 403);
    assert.equal((await api(superA, `/api/v1/admin/billing/receiving-accounts/${receiver.id}/approve`, "POST")).status, 200);
    assert.equal(await verifyBillingReceivingAccount(receiver.id, accountOriginal), true);
    assert.equal(await verifyBillingReceivingAccount(receiver.id, accountAutofill), false);
    const selfProposal = await api(superA, "/api/v1/admin/billing/receiving-accounts", "POST", {
      bankCode: "VCB", bankName: "Ngân hàng QA", accountName: "FINOVA QA SECOND", accountNumber: "998877661234",
    });
    assert.equal(selfProposal.status, 201);
    const selfPayload = await selfProposal.json() as { data: { id: string } };
    assert.equal((await api(superA, `/api/v1/admin/billing/receiving-accounts/${selfPayload.data.id}/approve`, "POST")).status, 403);
    assert.equal((await api(superB, `/api/v1/admin/billing/receiving-accounts/${selfPayload.data.id}/approve`, "POST")).status, 200);
    assert.equal((await prisma.billingReceivingAccount.findUniqueOrThrow({ where: { id: receiver.id } })).status, "DISABLED");
    const accountsResponse = await (await api(admin, "/api/v1/admin/billing/receiving-accounts")).text();
    assert.ok(!accountsResponse.includes(accountOriginal) && !accountsResponse.includes(accountAutofill),
      "Admin API must not disclose account numbers");
    assert.ok(!accountsResponse.includes(receiver.accountNumberEncrypted),
      "Admin API must not disclose encrypted account data");
    console.log("PASS: receiver masked preview, snapshot integrity, independent approval, encrypted verification");

    // An existing pending order keeps its price snapshot after a new catalog
    // version is published from the visible confirmation interface.
    const oldOrder = await createBillingOrder(users.ordinary, originalPrice.id, `old_${marker}`);
    await navigate("/admin/billing/prices");
    await fill("#price-value", "39000");
    await evaluate("document.querySelector('.admin-account-form button[type=submit]').click()");
    const draft = await until(async () => prisma.planPrice.findFirst({
      where: { planCode: "PREMIUM", productCode: "PREMIUM_MONTHLY", publishedAt: null,
        version: { gt: originalPrice.version } }, orderBy: { version: "desc" },
    }), "new price draft");
    assert.ok(draft, "Price draft missing");
    createdPriceId = draft.id;
    await navigate("/admin/billing/prices");
    const priceSelector = `#price-${draft.id}`;
    await fill(priceSelector, "41000");
    await evaluate(`document.querySelector(${JSON.stringify(priceSelector)}).closest('form').querySelector('button[type=submit]').click()`);
    await until(async () => {
      const price = await prisma.planPrice.findUnique({ where: { id: draft.id } });
      return Number(price?.priceVnd) === 41000;
    }, "updated draft price");
    await navigate("/admin/billing/prices");
    const publishButton = `document.querySelector(${JSON.stringify(priceSelector)}).closest('tr').querySelector('button.button-primary')`;
    await evaluate(`${publishButton}.click()`);
    await until(() => evaluate<boolean>("!!document.querySelector('[aria-label=\"Xem trước thay đổi bảng giá\"]')"), "price preview");
    const pricePreview = await evaluate<string>("document.querySelector('[aria-label=\"Xem trước thay đổi bảng giá\"]').innerText");
    assert.ok(pricePreview.includes("41.000") && pricePreview.includes(new Intl.NumberFormat("vi-VN").format(Number(originalPrice.priceVnd))),
      "Price preview must compare published and draft prices");
    await evaluate("document.querySelector('[aria-label=\"Xem trước thay đổi bảng giá\"] button.button-outline').click()");
    assert.equal((await prisma.planPrice.findUniqueOrThrow({ where: { id: draft.id } })).isPublished, false,
      "Cancel must leave draft unchanged");
    await evaluate(`${publishButton}.click()`);
    await until(() => evaluate<boolean>("!!document.querySelector('[aria-label=\"Xem trước thay đổi bảng giá\"]')"), "price confirmation");
    await evaluate("document.querySelector('[aria-label=\"Xem trước thay đổi bảng giá\"] button.button-primary').click()");
    await until(async () => (await prisma.planPrice.findUnique({ where: { id: draft.id } }))?.isPublished, "published price");
    assert.equal((await prisma.planPrice.findUniqueOrThrow({ where: { id: originalPrice.id } })).isPublished, false);
    const newOrder = await createBillingOrder(users.ordinary, draft.id, `new_${marker}`);
    assert.equal(oldOrder.amountVnd, Number(originalPrice.priceVnd), "Old order price snapshot");
    assert.equal(newOrder.amountVnd, 41000, "New order must use published price");
    console.log("PASS: draft create/edit, preview/cancel/publish, old and new order snapshots");

    for (const { route, width, theme } of [
      { route: "/admin/billing/prices", width: 1440, theme: "light" },
      { route: "/admin/billing/prices", width: 390, theme: "light" },
      { route: "/admin/billing/prices", width: 320, theme: "dark" },
      { route: "/admin/billing/accounts", width: 1440, theme: "dark" },
      { route: "/admin/billing/accounts", width: 390, theme: "light" },
      { route: "/admin/billing/accounts", width: 320, theme: "dark" },
    ]) {
      await cdp("Emulation.setDeviceMetricsOverride", { width, height: 850, mobile: width < 768, deviceScaleFactor: 1 });
      await evaluate(`localStorage.setItem('finova-theme', ${JSON.stringify(theme)})`);
      await navigate(route);
      assert.ok((await evaluate<number>("document.documentElement.scrollWidth")) <= width + 1,
        `${route} ${width}: horizontal overflow`);
      const pageText = await evaluate<string>("document.body.innerText");
      assert.ok(pageText.includes("PRICE_PUBLISH") || pageText.includes("RECEIVER_APPROVE"), "Audit log must render");
      assert.ok(!pageText.includes(accountOriginal) && !pageText.includes(accountAutofill), "No full bank account in page");
      await evaluate(axe);
      const severe = await evaluate<Array<{ id: string; impact: string }>>(`axe.run(document,
        { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa'] } })
        .then(r => r.violations.filter(v => ['serious','critical'].includes(v.impact))
          .map(v => ({ id: v.id, impact: v.impact })))`);
      assert.deepEqual(severe, [], `${route} ${width} ${theme}: WCAG serious/critical`);
      console.log(`PASS: ${route} ${width}px ${theme}, audit, privacy, overflow, axe`);
    }
    console.log("AD2_07_BROWSER_QA_PASS: signed QA sessions; production OAuth/provider UAT not covered");
  } finally {
    socket?.close(); chrome?.kill();
    for (const waiting of pending.values()) { clearTimeout(waiting.timer); waiting.reject(new Error("Browser shutdown")); }
    if (profile) await rm(profile, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
    // Delete disposable user/receiver/order fixtures. Published QA price history
    // remains intentionally immutable, and belongs only to the disposable DB.
    await prisma.billingOrder.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.billingReceivingAccount.deleteMany({ where: { createdBy: { in: userIds } } });
    await prisma.adminAuditLog.deleteMany({ where: { actorId: { in: userIds } } });
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
    if (createdPriceId) console.log(`QA published catalog price retained: ${createdPriceId}; existing prices before QA: ${qaPriceBefore}`);
  }
}
main().catch(err => { console.error(err); process.exitCode = 1; }).finally(() => prisma.$disconnect());
