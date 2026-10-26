/** AD2-06 DEV acceptance with signed synthetic QA sessions and live local Next APIs.
 * Requires a dedicated finova_admin_test_ad206_* database with migrations applied.
 * Bank transfer/payment states are synthetic fixtures, not provider UAT.
 */
import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "../src/lib/db";
import { auth } from "../src/server/auth";
import { seedPremiumCatalogAndLiteSubscriptions } from "../src/modules/billing/seed";
import { approveReceivingAccount, proposeReceivingAccount } from "../src/modules/billing/service";
import { getEffectiveSubscription } from "../src/server/premium";

const database = new URL(process.env.DATABASE_URL ?? "postgres://invalid/invalid");
assert.equal(database.hostname, "127.0.0.1");
assert.equal(database.port, "55433");
assert.match(database.pathname, /^\/finova_admin_test_ad206_[A-Za-z0-9_]+$/);
assert.equal(process.env.FINOVA_ADMIN_ENABLED, "1");
assert.equal(process.env.FINOVA_BILLING_CHECKOUT_ENABLED, "1");
assert.match(process.env.FINOVA_BILLING_ENCRYPTION_KEY ?? "", /^[a-f0-9]{64}$/i);
const base = new URL(process.env.FINOVA_BROWSER_URL ?? "http://localhost:31646");
assert.ok(["localhost", "127.0.0.1"].includes(base.hostname));
const browserExecutable = [process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"].find(x => x && existsSync(x));
assert.ok(browserExecutable, "Chrome/Edge browser required");

const marker = randomUUID().replaceAll("-", "");
const users = ["customer", "other", "admin", "approver"].map(x => `qa_ad206_${x}_${marker}`);
const [customer, other, admin, approver] = users as [string, string, string, string];
const tokens: string[] = [];
let receiverId: string | undefined;
let chrome: ChildProcess | undefined;
let socket: WebSocket | undefined;
let profile = "";
let sequence = 0;
type Reply = { result?: { value?: unknown }; exceptionDetails?: { text: string }; success?: boolean };
const pending = new Map<number, { resolve: (v: Reply) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function cdp(method: string, params: object = {}): Promise<Reply> {
  assert.ok(socket);
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timeout`)); }, 20_000);
    pending.set(id, { resolve, reject, timer });
    socket!.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate<T>(expression: string): Promise<T> {
  const result = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(`Chrome evaluation: ${result.exceptionDetails.text}`);
  return result.result?.value as T;
}
async function until<T>(fn: () => Promise<T>, name: string): Promise<T> {
  for (let attempt = 0; attempt < 130; attempt++) {
    try { const value = await fn(); if (value) return value; } catch { /* navigation in flight */ }
    await sleep(180);
  }
  throw new Error(`Timeout: ${name}`);
}
async function navigate(route: string) {
  await cdp("Page.navigate", { url: new URL(route, base).href });
  await until(() => evaluate<boolean>("document.readyState === 'complete' && !!document.querySelector('h1.page-title')"), route);
}
async function setCookie(cookie: string) {
  await cdp("Network.clearBrowserCookies");
  const index = cookie.indexOf("=");
  const set = await cdp("Network.setCookie", { name: cookie.slice(0, index),
    value: decodeURIComponent(cookie.slice(index + 1)), url: base.href,
    path: "/", httpOnly: true, sameSite: "Lax" });
  assert.equal(set.success, true);
}
async function pageText() { return evaluate<string>("document.querySelector('main')?.innerText ?? document.body.innerText"); }
async function api(cookie: string, route: string, method = "GET", body?: object, idempotencyKey?: string) {
  return fetch(new URL(route, base), { method, redirect: "manual", headers: {
    cookie, origin: base.origin, ...(body ? { "Content-Type": "application/json" } : {}),
    ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
  }, body: body ? JSON.stringify(body) : undefined });
}

async function main() {
  assert.equal(await prisma.user.count(), 0, "QA database must start empty");
  const migrated = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`;
  assert.equal(Number(migrated[0]?.count), 29);
  const authContext = await auth.$context;
  async function issue(userId: string) {
    const token = randomUUID(); tokens.push(token);
    await prisma.session.create({ data: { id: randomUUID(), token, userId,
      createdAt: new Date(), expiresAt: new Date(Date.now() + 3600_000) } });
    const signature = createHmac("sha256", authContext.secret).update(token).digest("base64");
    return authContext.authCookies.sessionToken.name + "=" + encodeURIComponent(`${token}.${signature}`);
  }
  try {
    await prisma.user.createMany({ data: users.map(id => ({ id, name: "QA Checkout", email: `${id}@example.test`, emailVerified: true })) });
    await seedPremiumCatalogAndLiteSubscriptions();
    const receiver = await proposeReceivingAccount({ userId: admin, role: "SUPER_ADMIN" }, {
      bankCode: "QA", bankName: "Ngân hàng thử nghiệm", accountName: "FINOVA QA ONLY", accountNumber: "987654321098",
    });
    receiverId = receiver.id;
    await approveReceivingAccount({ userId: approver, role: "SUPER_ADMIN" }, receiver.id);
    const cookie = await issue(customer);
    const anotherCookie = await issue(other);
    const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
    assert.equal(session?.user.id, customer);
    const remote = await api(cookie, "/api/auth/get-session");
    assert.equal((await remote.json() as { user?: { id: string } }).user?.id, customer,
      "QA browser server must use same database and auth secret");

    const monthly = await prisma.planPrice.findFirstOrThrow({ where: { productCode: "PREMIUM_MONTHLY", isPublished: true } });
    const yearly = await prisma.planPrice.findFirstOrThrow({ where: { productCode: "PREMIUM_YEARLY", isPublished: true } });
    assert.equal(Number(monthly.priceVnd), 29000);
    assert.equal(Number(yearly.priceVnd), 199000);
    assert.equal((await getEffectiveSubscription(customer)).plan, "LITE");
    const invalid = await api(cookie, "/api/v1/billing/orders", "POST", { priceId: "nonexistent" }, `bad_${marker}`);
    assert.equal(invalid.status, 422);
    assert.equal((await api(anotherCookie, "/api/v1/billing/orders")).status, 200);

    profile = await mkdtemp(path.join(os.tmpdir(), "finova-checkout-"));
    chrome = spawn(browserExecutable!, ["--headless=new", ...(process.env.CI ? ["--no-sandbox"] : []),
      "--no-first-run", "--disable-extensions", "--disable-background-networking",
      "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
    const port = await until(async () => {
      const file = path.join(profile, "DevToolsActivePort");
      return existsSync(file) ? Number((await readFile(file, "utf8")).split(/\r?\n/)[0]) : 0;
    }, "Chrome debugger");
    const tab = await until(async () => {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      return (await response.json() as Array<{ type: string; webSocketDebuggerUrl?: string }>).find(x => x.type === "page" && x.webSocketDebuggerUrl);
    }, "Chrome page");
    assert.ok(tab?.webSocketDebuggerUrl);
    socket = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      socket!.addEventListener("open", () => resolve(), { once: true });
      socket!.addEventListener("error", () => reject(new Error("Chrome websocket unavailable")), { once: true });
    });
    socket.addEventListener("message", event => {
      const message = JSON.parse(String(event.data));
      const item = pending.get(message.id);
      if (!item) return;
      pending.delete(message.id); clearTimeout(item.timer);
      if (message.error) item.reject(new Error(message.error.message));
      else item.resolve(message.result);
    });
    await cdp("Page.enable"); await cdp("Runtime.enable"); await cdp("Network.enable");
    await setCookie(cookie);
    await navigate("/pricing");
    assert.match(await pageText(), /29\.000 VNĐ/);
    assert.match(await pageText(), /199\.000 VNĐ/);
    const buttons = await evaluate<number>("document.querySelectorAll('.subscription-plan button:not(:disabled)').length");
    assert.equal(buttons, 2, "Both published periods must be available");
    // Exercise the hydrated React checkout button in Chrome, not only a direct API request.
    await evaluate("document.querySelector('.subscription-plan button').click()");
    const order = await until(async () => prisma.billingOrder.findFirst({ where: { userId: customer } }), "React checkout creates order");
    assert.ok(order);
    await until(() => evaluate<boolean>(`location.pathname === '/billing/checkout/${order.id}'`), "React checkout navigation");
    assert.equal(Number(order.amountDueVnd), 29000);
    assert.equal(order.status, "PENDING_PAYMENT");
    assert.equal((await getEffectiveSubscription(customer)).plan, "LITE", "Order creation must not grant Premium");
    assert.equal((await api(anotherCookie, `/api/v1/billing/orders/${order.id}`)).status, 404);
    const repeat = await api(cookie, "/api/v1/billing/orders", "POST", { priceId: monthly.id }, order.idempotencyKey);
    assert.equal(repeat.status, 201);
    assert.equal((await repeat.json() as { data: { id: string } }).data.id, order.id);
    assert.equal(await prisma.billingOrder.count({ where: { userId: customer } }), 1);

    const extra: Array<{ id: string; status: "PAID" | "REVIEW" | "EXPIRED" | "REFUNDED"; activated: boolean }> = [];
    for (const [status, activated] of [["PAID", false], ["PAID", true], ["REVIEW", false], ["EXPIRED", false], ["REFUNDED", false]] as const) {
      const item = await prisma.billingOrder.create({ data: {
        userId: customer, priceId: yearly.id, receiverAccountId: receiver.id,
        orderCode: `QA${randomBytes(10).toString("hex").toUpperCase()}`, idempotencyKey: `qa_${status}_${randomUUID()}`,
        planCode: "PREMIUM", billingPeriodSnapshot: "YEAR", periodCountSnapshot: 1,
        amountDueVnd: 199000, status,
        createdAt: new Date(Date.now() - (status === "EXPIRED" ? 48 * 3600000 : 0)),
        expiresAt: new Date(Date.now() + (status === "EXPIRED" ? -86400000 : 86400000)),
        paidAt: status === "PAID" || status === "REFUNDED" ? new Date() : null,
        activatedAt: activated ? new Date() : null,
      } });
      extra.push({ id: item.id, status, activated });
    }
    const axe = await readFile(path.resolve("node_modules/axe-core/axe.min.js"), "utf8");
    for (const { width, theme } of [
      { width: 1440, theme: "light" }, { width: 390, theme: "light" }, { width: 320, theme: "dark" },
    ]) {
      await cdp("Emulation.setDeviceMetricsOverride", { width, height: 850, mobile: width < 768, deviceScaleFactor: 1 });
      for (const route of ["/pricing", `/billing/checkout/${order.id}`, "/settings/subscription"]) {
        await navigate(route);
        await evaluate(`localStorage.setItem('finova-theme', ${JSON.stringify(theme)})`);
        await navigate(route);
        const state = await evaluate<{ scrollWidth: number; viewport: number; title: string; theme: string }>(`({
          scrollWidth: document.documentElement.scrollWidth, viewport: innerWidth,
          title: document.querySelector('h1.page-title')?.textContent ?? '',
          theme: document.documentElement.dataset.theme })`);
        assert.equal(state.viewport, width);
        assert.ok(state.scrollWidth <= width + 1, `${route} ${width}px horizontal overflow ${state.scrollWidth}`);
        assert.equal(state.theme, theme);
        const content = await pageText();
        if (route === "/pricing") assert.match(content, /29\.000 VNĐ[\s\S]*199\.000 VNĐ/);
        if (route.includes("checkout")) {
          assert.match(content, /Chờ thanh toán/);
          assert.match(content, /987654321098/);
          assert.match(content, new RegExp(order.orderCode));
          assert.match(content, /Chờ xác minh tiền vào/);
        }
        if (route.includes("subscription")) {
          assert.match(content, /Finova Lite/);
          for (const entry of extra) assert.match(content, new RegExp(entry.status === "EXPIRED" ? "Đã hết hạn" : entry.status === "REVIEW" ? "Cần đối soát" : entry.status === "REFUNDED" ? "Đã hoàn tiền" : "Đã nhận tiền|Premium đã kích hoạt"));
        }
        await evaluate(axe);
        const violations = await evaluate<Array<{ id: string; impact: string; nodes: string[] }>>(`axe.run(document, {
          runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa'] }
        }).then(r => r.violations.map(v => ({ id: v.id, impact: v.impact,
          nodes: v.nodes.map(n => n.target.join(' ') + ': ' + (n.failureSummary ?? '').slice(0, 130)) })))`);
        assert.deepEqual(violations.filter(v => v.impact === "serious" || v.impact === "critical"), [],
          `${route} ${width}px ${theme}: WCAG serious/critical violations`);
      }
      console.log(`PASS: AD2-06 ${width}px ${theme}, pricing/checkout/history and WCAG`);
    }
    for (const entry of extra) {
      await navigate(`/billing/checkout/${entry.id}`);
      const content = await pageText();
      const expected = entry.status === "EXPIRED" ? "Đơn đã hết hạn" : entry.status === "REVIEW"
        ? "Cần đối soát tiền vào" : entry.status === "REFUNDED" ? "Đã hoàn tiền"
          : entry.activated ? "Đã kích hoạt Premium" : "Đã nhận tiền, chờ kích hoạt";
      assert.ok(content.includes(expected), `${entry.status}/${entry.activated}: ${expected}`);
      assert.ok(!content.includes("987654321098"), "Non-pending state must not display transfer credentials");
    }
    const list = await api(cookie, "/api/v1/billing/orders");
    assert.equal(list.status, 200);
    assert.equal((await list.json() as { data: unknown[] }).data.length, 6);
    assert.equal((await api(anotherCookie, "/api/v1/billing/orders")).status, 200);
    assert.equal((await getEffectiveSubscription(customer)).plan, "LITE", "Synthetic statuses alone never grant a real entitlement");
    console.log("ADMIN_CHECKOUT_BROWSER_QA_PASS: signed session, real React checkout, idempotency, owner scope, 6 server states, 1440/390/320, dark/light and axe");
  } finally {
    socket?.close(); chrome?.kill();
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error("Browser stopped")); }
    if (profile) await rm(profile, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
    await prisma.billingOrder.deleteMany({ where: { userId: customer } });
    if (receiverId) await prisma.billingReceivingAccount.deleteMany({ where: { id: receiverId } });
    await prisma.adminAuditLog.deleteMany({ where: { actorId: { in: users } } });
    await prisma.productPageviewReceipt.deleteMany({ where: { userId: { in: users } } });
    await prisma.productUsageDaily.deleteMany({ where: { userId: { in: users } } });
    for (const userId of users) {
      const workspaceId = `personal-${userId}`;
      await prisma.category.deleteMany({ where: { workspaceId } });
      await prisma.ledgerAccount.deleteMany({ where: { workspaceId } });
      await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    }
    await prisma.subscription.deleteMany({ where: { userId: { in: users } } });
    await prisma.session.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    assert.equal(await prisma.user.count({ where: { id: { in: users } } }), 0);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
