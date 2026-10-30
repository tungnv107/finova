/** Actual Chrome UI, local QA DB fixture, no real user session or cloud AI. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
const base = "http://localhost:31649";
const fixture = JSON.parse(await readFile("artifacts/ai-p0/browser-fixture.json", "utf8"));
const executable = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
assert.ok(executable, "Chrome/Edge is required");
const profile = await mkdtemp(path.join(os.tmpdir(), "finova-ai-browser-"));
const child = spawn(executable, ["--headless=new", "--disable-gpu", "--no-first-run", "--remote-debugging-port=31650", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
let socket, sequence = 0;
const pending = new Map();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, label, max = 200) {
  for (let i = 0; i < max; i++) { try { const result = await fn(); if (result) return result; } catch { /* navigation/startup */ } await sleep(200); }
  throw new Error(`Timed out: ${label}`);
}
function cdp(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timeout`)); }, 45000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const response = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  return response.result?.value;
}
async function navigate(route, text) {
  await cdp("Page.navigate", { url: base + route });
  await until(() => evaluate(`document.body.innerText.includes(${JSON.stringify(text)})`), route);
}
async function screenshot(name) {
  const { data } = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(`artifacts/ai-p0/${name}.png`, Buffer.from(data, "base64"));
}
const results = [];
try {
  const targets = await until(async () => { const r = await fetch("http://127.0.0.1:31650/json/list"); return r.ok ? r.json() : null; }, "Chrome debugger");
  socket = new WebSocket(targets.find(t => t.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve); socket.addEventListener("error", reject); });
  socket.addEventListener("message", event => { const message = JSON.parse(String(event.data)); const item = pending.get(message.id); if (!item) return; pending.delete(message.id); clearTimeout(item.timer); if (message.error) item.reject(new Error(message.error.message)); else item.resolve(message.result ?? {}); });
  await cdp("Network.enable"); await cdp("Page.enable"); await cdp("Runtime.enable");
  const split = fixture.cookie.indexOf("=");
  const cookieResult = await cdp("Network.setCookie", { name: fixture.cookie.slice(0, split), value: decodeURIComponent(fixture.cookie.slice(split + 1)), url: base, path: "/", httpOnly: true, sameSite: "Lax" });
  assert.equal(cookieResult.success, true);
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1050, deviceScaleFactor: 1, mobile: false });
  await navigate("/imports", "Thêm sao kê, để AI lo phần nhập liệu");
  await until(() => evaluate("document.readyState === 'complete' && !!document.querySelector('#ai-statement-text') && Object.keys(document.querySelector('#ai-statement-text')).some(k=>k.startsWith('__reactProps'))"), "hydrated statement form");
  assert.equal(await evaluate("!!document.querySelector('#ai-reopen')"), false, "removed AI batch picker");
  assert.equal(await evaluate("document.querySelector('#ai-statement-text').matches(':disabled')"), true, "unconfigured provider UI");
  // An unconfigured provider cannot start a new AI preview. Review the isolated
  // fixture via API, then continue through the CSV/XLSX import history UI.
  const reviewStatus = await evaluate(`(async () => {
    const batch = (await (await fetch('/api/v1/imports/${fixture.batchId}')).json()).data;
    const row = batch.rows[0];
    const response = await fetch('/api/v1/imports/${fixture.batchId}/rows/' + row.id, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: row.kind, amount: row.amount, date: row.date, categoryId: row.categoryId, destinationWalletId: null, note: row.note, confirmed: true })
    });
    return response.status;
  })()`);
  assert.equal(reviewStatus, 200, "fixture review API");
  await evaluate("[...document.querySelectorAll('.import-desktop-table tr')].find(r=>r.textContent.includes('browser-statement.pdf')).querySelector('button').click()");
  await until(() => evaluate("document.body.innerText.includes('12345') || document.body.innerText.includes('12.345')"), "staged row");
  await screenshot("imports-desktop");
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Nhập 1 giao dịch vào ví')).click()");
  await until(() => evaluate("document.body.innerText.includes('Đã ghi vào ví')"), "ledger commit");
  const beforeRetry = await evaluate(`fetch('/api/v1/imports/${fixture.batchId}').then(r=>r.json())`);
  assert.equal(beforeRetry.data.counts.IMPORTED, 1); results.push("API review and UI commit");
  await navigate("/insights", "Hiểu dòng tiền của bạn");
  assert.equal(await evaluate("document.body.innerText.includes('113.345')"), true, "expense after UI import");
  assert.equal(await evaluate("document.body.innerText.includes('Đã vượt hạn mức')"), true);
  await screenshot("insights-desktop"); results.push("insights exact ledger totals and risk");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await screenshot("insights-mobile");
  assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), true, "mobile insights overflow");
  await navigate("/budgets", "Ngân sách thông minh");
  assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), true, "mobile budgets overflow");
  await navigate("/imports", "Thêm sao kê, để AI lo phần nhập liệu"); await screenshot("imports-mobile");
  assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), true, "mobile import overflow");
  results.push("390px responsive insights, budgets and import");
  await navigate("/transactions", "Giao dịch");
  await until(() => evaluate("document.readyState === 'complete' && Object.keys(document.querySelector('.mobile-fab')).some(k=>k.startsWith('__reactProps'))"), "hydrated quick action");
  await evaluate("document.querySelector('.mobile-fab').click()");
  await until(() => evaluate("!!document.querySelector('#quick-note')"), "quick form");
  await evaluate("(() => { const e=document.querySelector('#quick-note'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'Ăn trưa QA'); e.dispatchEvent(new Event('input',{bubbles:true})); })()");
  await until(() => evaluate("document.body.innerText.includes('Dùng danh mục này')"), "automatic history suggestion");
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Dùng danh mục này')).click()");
  assert.equal(await evaluate("document.querySelector('#quick-category').value"), fixture.categoryId);
  results.push("automatic classification and applying category");
  await cdp("Network.clearBrowserCookies");
  const unauthorized = await evaluate("fetch('/api/v1/ai/insights').then(r=>r.status)");
  assert.equal(unauthorized, 401); results.push("unauthenticated HTTP 401");
  await writeFile("artifacts/ai-p0/browser-results.json", JSON.stringify({ passed: true, results }, null, 2));
  console.log("PASS:", results.join("; "));
} catch (error) {
  if (socket) { await screenshot("failure").catch(() => {}); console.error(await evaluate("document.body.innerText.slice(-5000)").catch(() => "page unavailable")); }
  throw error;
} finally {
  if (socket) { try { await cdp("Browser.close"); } catch {} socket.close(); }
  child.kill();
  // mkdtemp returns a dedicated verified path under the OS temporary directory.
  if (path.dirname(path.resolve(profile)) === path.resolve(os.tmpdir()) && path.basename(profile).startsWith("finova-ai-browser-")) {
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }).catch(() => {});
  }
}
