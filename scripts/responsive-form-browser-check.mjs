/**
 * Validate shared Finova form CSS in a real headless browser without requiring
 * financial account credentials. This injects representative controls into the
 * public page; authenticated page and iOS Safari acceptance remain separate.
 * Start the local app, then run: node scripts/responsive-form-browser-check.mjs
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const base = new URL(process.env.FINOVA_BROWSER_URL || "http://localhost:3002");
assert.ok(["localhost", "127.0.0.1"].includes(base.hostname), "Local Finova only");
const browser = [process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean).find(existsSync);
assert.ok(browser, "Chrome or Edge must be installed");
const profile = await mkdtemp(path.join(os.tmpdir(), "finova-form-check-"));
let chrome, socket;
let id = 0;
const pending = new Map();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function command(method, params = {}) {
  return new Promise((resolve, reject) => {
    const callId = ++id;
    const timer = setTimeout(() => { pending.delete(callId); reject(new Error(`${method} timed out`)); }, 15000);
    pending.set(callId, { resolve, reject, timer });
    socket.send(JSON.stringify({ id: callId, method, params }));
  });
}
async function until(check, label) {
  for (let attempt = 0; attempt < 90; attempt++) {
    try { const result = await check(); if (result) return result; } catch { /* Initial navigation. */ }
    await delay(150);
  }
  throw new Error(`Timed out waiting for ${label}`);
}
async function evaluate(expression) {
  const answer = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (answer.exceptionDetails) throw new Error(`Page evaluation failed: ${answer.exceptionDetails.exception?.description || answer.exceptionDetails.text}`);
  return answer.result.value;
}

try {
  const response = await fetch(new URL("/login", base), { signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 200, "Finova dev server must be running");
  chrome = spawn(browser, ["--headless=new", "--no-first-run", "--disable-extensions",
    "--disable-background-networking", "--remote-debugging-port=0",
    `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
  const portFile = path.join(profile, "DevToolsActivePort");
  const port = await until(async () => existsSync(portFile)
    ? Number((await readFile(portFile, "utf8")).split(/\r?\n/)[0]) : null, "Chrome CDP");
  const target = await until(async () => {
    const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    return tabs.find(tab => tab.type === "page" && tab.webSocketDebuggerUrl);
  }, "Chrome page target");
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const waiter = pending.get(message.id);
    pending.delete(message.id);
    clearTimeout(waiter.timer);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  });
  await command("Page.enable");
  await command("Runtime.enable");

  for (const width of [320, 360, 390, 430, 767, 768, 820, 1024, 1180, 1440]) {
    await command("Emulation.setDeviceMetricsOverride", {
      width, height: width <= 430 ? 700 : 900, deviceScaleFactor: 1, mobile: width < 768,
    });
    await command("Page.navigate", { url: new URL("/login", base).href });
    await until(() => evaluate("document.readyState === 'complete' && !!document.querySelector('.login-page')"), "page styles");
    const metrics = await evaluate(`(() => {
      const field = (id, type, value = '2026-10-01') => '<div class="field"><label for="' + id + '">' + id + '</label><input id="' + id + '" type="' + type + '" value="' + value + '"></div>';
      const wallet = '<div class="field"><label for="qa-wallet">Ví</label><select id="qa-wallet"><option>Ngân hàng VTB</option></select></div>';
      const host = document.createElement('div');
      host.id = 'qa-forms';
      host.style.cssText = 'width:calc(100% - ' + (${width} >= 768 ? '300px' : '32px') + ');max-width:100%;padding:0;margin:0 auto;';
      host.innerHTML =
        '<form id="qa-report" class="card filterbar">' + field('qa-report-start','date') + field('qa-report-end','date') + wallet + wallet.replaceAll('qa-wallet','qa-category') + '<button class="button">Xem báo cáo</button></form>' +
        '<form id="qa-editor" class="card card-pad"><div class="form-grid">' + field('qa-occurred','datetime-local','2026-10-27T14:15') + field('qa-budget','date') + wallet.replaceAll('qa-wallet','qa-account') + field('qa-month','month','2026-10') + field('qa-search','text','Chi tiêu') + '</div></form>' +
        '<form id="qa-dashboard-sheet" class="card filterbar dashboard-filter-form expanded-mobile">' + field('qa-sheet-start','date') + field('qa-sheet-end','date') + wallet.replaceAll('qa-wallet','qa-sheet-wallet') + '<button class="button">Xem báo cáo</button></form>' +
        '<form id="qa-transaction-sheet" class="card filterbar v4-filter-form v4-transaction-filter-sheet is-open">' + field('qa-filter-start','date') + field('qa-filter-end','date') + wallet.replaceAll('qa-wallet','qa-filter-wallet') + '<button class="button">Áp dụng</button></form>' +
        '<section id="qa-wallet-history" class="card card-pad"><form class="form-grid">' + wallet.replaceAll('qa-wallet','qa-history-wallet') + field('qa-history-date','date','2026-10-28') + '<div><button type="button" class="button button-soft">Xem số dư và lịch sử</button></div></form></section>' +
        '<form id="qa-report-tabs" class="card card-pad"><div class="form-grid">' + field('qa-tab-start','date') + field('qa-tab-end','date') + wallet.replaceAll('qa-wallet','qa-tab-wallet') + '</div></form>';
      document.body.append(host);
      const names = ['qa-report','qa-editor','qa-dashboard-sheet','qa-transaction-sheet','qa-wallet-history','qa-report-tabs'];
      const invalid = [];
      for (const name of names) {
        const form = document.getElementById(name);
        const formRect = form.getBoundingClientRect();
        const fields = [...form.querySelectorAll('.field')];
        const rects = fields.map(el => el.getBoundingClientRect());
        if (formRect.left < -1 || formRect.right > innerWidth + 1 || form.scrollWidth > form.clientWidth + 1) invalid.push(name + ': form overflow');
        for (let i=0; i<fields.length; i++) {
          const ctrl = fields[i].querySelector('input,select');
          const rect = ctrl.getBoundingClientRect();
          if (rect.left < rects[i].left - 1 || rect.right > rects[i].right + 1 || rect.right > innerWidth + 1) invalid.push(ctrl.id + ': control overflow');
          for (let j=i+1; j<fields.length; j++) {
            const other = rects[j];
            if (rects[i].left < other.right - 2 && rects[i].right > other.left + 2 && rects[i].top < other.bottom - 2 && rects[i].bottom > other.top + 2) invalid.push(fields[i].querySelector('label').textContent + ': overlapping field');
          }
          if (${width} <= 1199 && ctrl.matches('input[type=date],input[type=datetime-local],input[type=month]') && parseFloat(getComputedStyle(ctrl).fontSize) < 16) invalid.push(ctrl.id + ': iOS font smaller than 16px');
        }
      }
      // Inputs must show no focus border recoloring, outline or glow in either theme.
      for (const theme of ['light', 'dark']) {
        document.documentElement.dataset.theme = theme;
        for (const id of ['qa-report-start', 'qa-occurred', 'qa-wallet', 'qa-search', 'qa-history-date', 'qa-filter-start', 'qa-sheet-start', 'qa-month']) {
          const ctrl = document.getElementById(id);
          const originalBorder = getComputedStyle(ctrl).borderColor;
          ctrl.focus({ preventScroll: true });
          const styles = getComputedStyle(ctrl);
          if (styles.borderColor !== originalBorder) invalid.push(id + ': ' + theme + ' focus border changed color');
          if (styles.outlineStyle !== 'none') invalid.push(id + ': ' + theme + ' focus outline visible');
          if (styles.boxShadow !== 'none') invalid.push(id + ': ' + theme + ' focus shadow visible');
          ctrl.blur();
        }
      }
      return { invalid, viewport: innerWidth, forms: names.length, sheetScrollable: getComputedStyle(document.getElementById('qa-dashboard-sheet')).overflowY === 'auto' };
    })()`);
    assert.equal(metrics.viewport, width, "Viewport emulation");
    assert.deepEqual(metrics.invalid, [], `${width}px layout: ${metrics.invalid.join('; ')}`);
    if (width < 768) assert.equal(metrics.sheetScrollable, true, "Mobile filter sheet should scroll");
    console.log(`PASS: form layout ${width}px, 6 representative forms, no control overlap or focus effects`);
  }
} finally {
  for (const waiter of pending.values()) { clearTimeout(waiter.timer); waiter.reject(new Error("Browser closed")); }
  pending.clear();
  socket?.close();
  chrome?.kill();
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
