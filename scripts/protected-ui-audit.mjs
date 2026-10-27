/**
 * Read-only UI acceptance against a real, authenticated Finova browser session.
 * Run a local Chrome with --remote-debugging-port=9222 and a dedicated user-data-dir,
 * sign in to localhost:3002 in that browser, then npm run test:ui:auth.
 * No credentials are extracted, no POST/PATCH/DELETE is sent, and no financial
 * content or screenshots are persisted unless FINOVA_QA_CAPTURE=1 is specified.
 */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const base = new URL(process.env.FINOVA_QA_URL || "http://localhost:3002");
const debuggerUrl = new URL(process.env.FINOVA_QA_CDP_URL || "http://127.0.0.1:9222");
for (const address of [base, debuggerUrl]) {
  assert.ok(["localhost", "127.0.0.1"].includes(address.hostname), "Only localhost browsers are supported");
  assert.ok(!address.username && !address.password, "Do not pass credentials in URLs");
}
const capture = process.env.FINOVA_QA_CAPTURE === "1";
const axeScript = await readFile(path.resolve("node_modules/axe-core/axe.min.js"), "utf8");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket, target;
let id = 0;
const pending = new Map();
const results = { timestamp: new Date().toISOString(), origin: base.origin, screenshotConsent: capture, routes: [], interactions: [], violations: [] };

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const callId = ++id;
    const timer = setTimeout(() => { pending.delete(callId); reject(new Error(`${method}: timeout`)); }, 20000);
    pending.set(callId, { resolve, reject, timer });
    socket.send(JSON.stringify({ id: callId, method, params }));
  });
}
async function evaluate(expression) {
  const response = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error(`Browser evaluation failed: ${response.exceptionDetails.text}`);
  return response.result.value;
}
async function waitFor(test, what) {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { const result = await test(); if (result) return result; } catch { /* Navigation may still be settling. */ }
    await delay(175);
  }
  throw new Error(`Timed out waiting for ${what}`);
}
async function navigate(route) {
  await send("Page.navigate", { url: new URL(route, base).href });
  const current = await waitFor(() => evaluate("document.readyState === 'complete' && (location.pathname === '/login' || !!document.querySelector('.app-shell')) && location.pathname"), `${route} layout`);
  if (current === "/login") throw new Error("BLOCKED_AUTH: Browser session is not authenticated. Sign in through the existing Google OAuth flow before this audit.");
  assert.equal(current, route, `${route} navigation`);
  await delay(250);
}
async function auditAccessibility(route, viewport, theme) {
  await evaluate(axeScript);
  const findings = await evaluate(`axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa'] } }).then(r => r.violations.map(v => ({ id: v.id, impact: v.impact, selectors: v.nodes.slice(0, 4).map(n => n.target.join(' ')), count: v.nodes.length })))`);
  results.violations.push({ route, viewport, theme, findings });
  const severe = findings.filter(v => v.impact === "critical" || v.impact === "serious");
  assert.deepEqual(severe, [], `${route} ${viewport} ${theme}: serious accessibility violations`);
}
async function auditViewport(route, viewport, theme) {
  await send("Emulation.setDeviceMetricsOverride", { width: viewport, height: viewport <= 430 ? 700 : 900, deviceScaleFactor: 1, mobile: viewport < 768 });
  await evaluate(`localStorage.setItem('finova-theme', ${JSON.stringify(theme)})`);
  await navigate(route);
  const metrics = await evaluate(`(() => {
    const mobile = ${viewport} < 768;
    const nav = document.querySelector('.mobile-nav');
    const sidebar = document.querySelector('.sidebar');
    const fab = document.querySelector('.mobile-fab');
    const visible = el => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
    const tabLinks = [...document.querySelectorAll('.mobile-link')];
    return {
      pathname: location.pathname,
      theme: document.documentElement.dataset.theme,
      width: innerWidth,
      docWidth: document.documentElement.scrollWidth,
      contentWidth: document.querySelector('.main')?.scrollWidth,
      visibleNav: visible(nav),
      visibleSidebar: visible(sidebar),
      links: tabLinks.length,
      clippedTabs: tabLinks.filter(el => el.scrollWidth > el.clientWidth + 1 || el.getBoundingClientRect().right > innerWidth + 1).length,
      fabSize: fab ? Math.min(fab.getBoundingClientRect().width, fab.getBoundingClientRect().height) : 0,
      fabName: fab?.getAttribute('aria-label') || '',
      pageHeadings: document.querySelectorAll('h1').length,
      safeAreaBottom: getComputedStyle(nav).paddingBottom,
      mainBottomPadding: getComputedStyle(document.querySelector('.content')).paddingBottom,
      fcpMs: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
      lcpMs: window.__finovaUiVitals?.lcp ?? null,
      cls: window.__finovaUiVitals?.cls ?? null,
    };
  })()`);
  assert.equal(metrics.width, viewport, "Viewport override");
  assert.equal(metrics.theme, theme, `${route}: theme`);
  assert.ok(metrics.docWidth <= viewport + 1, `${route} ${viewport}: horizontal overflow (${metrics.docWidth}px)`);
  assert.ok(metrics.contentWidth <= viewport + 1, `${route} ${viewport}: main overflow`);
  assert.equal(metrics.visibleNav, viewport < 768, `${route}: mobile navigation breakpoint`);
  assert.equal(metrics.visibleSidebar, viewport >= 768, `${route}: sidebar breakpoint`);
  assert.equal(metrics.links, 4, `${route}: four mobile destinations`);
  assert.equal(metrics.clippedTabs, 0, `${route}: clipped mobile tabs`);
  if (viewport < 768) assert.ok(metrics.fabSize >= 44 && metrics.fabName, `${route}: accessible FAB`);
  assert.equal(metrics.pageHeadings, 1, `${route}: page heading`);
  if (capture && [320, 390, 430, 1440].includes(viewport)) {
    const screenshot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(`artifacts/qa/auth-${route.slice(1)}-${viewport}-${theme}.png`, Buffer.from(screenshot.data, "base64"));
  }
  results.routes.push({ route, viewport, theme, ...metrics });
  console.log(`PASS ${route} ${viewport} ${theme}`);
}
async function auditInteractions() {
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 720, deviceScaleFactor: 1, mobile: true });
  await navigate("/dashboard");
  await evaluate("document.querySelector('.mobile-fab').click()");
  await waitFor(() => evaluate("!!document.querySelector('.quick-sheet[role=dialog]')"), "quick transaction dialog");
  const dialog = await evaluate(`({ modal: document.querySelector('.quick-sheet')?.getAttribute('aria-modal'), focus: document.activeElement?.getAttribute('aria-label'), locked: document.body.style.overflow, buttons: [...document.querySelectorAll('.v4-quick-kind [role=radio]')].map(b => b.textContent) })`);
  assert.equal(dialog.modal, "true");
  assert.equal(dialog.focus, "Đóng biểu mẫu");
  assert.equal(dialog.locked, "hidden");
  assert.equal(dialog.buttons.length, 3);
  // Confirm the dialog traps keyboard focus in both directions, even while
  // asynchronous wallet/category data is loading. This is read-only.
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, modifiers: 8 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, modifiers: 8 });
  const lastFocusableFocused = await evaluate(`(() => {
    const buttons = [...document.querySelector('.quick-sheet').querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
    return buttons.length > 1 && document.activeElement === buttons.at(-1);
  })()`);
  assert.equal(lastFocusableFocused, true, "Shift+Tab wraps to last dialog control");
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  assert.equal(await evaluate("document.activeElement?.getAttribute('aria-label')"), "Đóng biểu mẫu", "Tab wraps to first dialog control");
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await waitFor(() => evaluate("!document.querySelector('.quick-sheet')"), "dialog close");
  assert.equal(await evaluate("document.activeElement?.getAttribute('aria-label')"), "Thêm giao dịch", "FAB focus restoration");
  results.interactions.push({ name: "FAB dialog, bidirectional focus trap, Escape, focus restore, scroll lock", status: "PASS" });

  await evaluate("document.querySelector('.filter-toolbar .filter-chip').click()");
  await waitFor(() => evaluate("document.querySelector('#dashboard-filters[role=dialog]')?.getAttribute('aria-modal') === 'true'"), "mobile filter dialog");
  assert.equal(await evaluate("document.activeElement?.getAttribute('aria-label')"), "Đóng bộ lọc", "Filter dialog initial focus");
  assert.equal(await evaluate("document.body.style.overflow"), "hidden", "Filter scroll lock");
  await evaluate("[...document.querySelectorAll('.dashboard-filter-presets button')].find(b => b.textContent === 'Tháng trước').click()");
  const preset = await evaluate(`(() => ({
    selected: [...document.querySelectorAll('.dashboard-filter-presets button')].find(b => b.textContent === 'Tháng trước')?.getAttribute('aria-pressed'),
    start: document.querySelector('#report-from')?.value,
    end: document.querySelector('#report-to')?.value
  }))()`);
  assert.equal(preset.selected, "true", "Previous month shortcut selected");
  assert.match(preset.start, /^\d{4}-\d{2}-01$/);
  assert.match(preset.end, /^\d{4}-\d{2}-01$/);
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, modifiers: 8 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, modifiers: 8 });
  assert.equal(await evaluate("document.activeElement?.textContent.trim()"), "Xem báo cáo", "Filter Shift+Tab wraps to submit");
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  assert.equal(await evaluate("document.activeElement?.getAttribute('aria-label')"), "Đóng bộ lọc", "Filter Tab wraps to close");
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await waitFor(() => evaluate("!document.querySelector('#dashboard-filters[role=dialog]')"), "filter dialog close");
  assert.equal(await evaluate("document.activeElement?.textContent.trim()"), "Bộ lọc", "Filter focus restoration");
  assert.notEqual(await evaluate("document.body.style.overflow"), "hidden", "Filter scroll unlock");
  results.interactions.push({ name: "Dashboard mobile filter sheet, presets, keyboard trap, Escape, focus restore", status: "PASS" });

  await navigate("/reports");
  await evaluate("document.querySelector('[role=tab][aria-selected=true]').focus()");
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 });
  await waitFor(() => evaluate("document.querySelector('[role=tab][aria-selected=true]')?.id === 'report-tab-1'"), "report keyboard tab");
  results.interactions.push({ name: "Reports arrow-key tab navigation", status: "PASS" });
  await navigate("/settings");
  await evaluate("document.querySelector('[aria-label=\"Giao diện tối\"]').click()");
  assert.equal(await evaluate("document.documentElement.dataset.theme"), "dark", "Settings theme switch");
  assert.equal(await evaluate("localStorage.getItem('finova-theme')"), "dark", "Theme persistence");
  results.interactions.push({ name: "Settings theme selection and persistence", status: "PASS" });
}

try {
  const newTab = new URL(`/json/new?${encodeURIComponent(base.origin + "/dashboard")}`, debuggerUrl);
  let response;
  try {
    response = await fetch(newTab, { method: "PUT", signal: AbortSignal.timeout(6000) });
  } catch (error) {
    const cause = error instanceof Error ? (error.cause?.code || error.message) : String(error);
    throw new Error(`BLOCKED_AUTH: Chrome QA debugging endpoint ${debuggerUrl.origin} is unavailable (${cause}). Start the dedicated Chrome QA profile with --remote-debugging-port=9222 and sign in through Google.`);
  }
  assert.equal(response.status, 200, "Chrome DevTools /json/new: use an active, local debugging browser");
  target = await response.json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", event => {
    const msg = JSON.parse(event.data);
    if (!msg.id || !pending.has(msg.id)) return;
    const waiter = pending.get(msg.id);
    pending.delete(msg.id);
    clearTimeout(waiter.timer);
    if (msg.error) waiter.reject(new Error(msg.error.message));
    else waiter.resolve(msg.result);
  });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `(() => {
    const vitals = { cls: 0, lcp: null };
    window.__finovaUiVitals = vitals;
    try { new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) vitals.cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch {}
    try { new PerformanceObserver(list => { for (const e of list.getEntries()) vitals.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch {}
  })();` });
  await navigate("/dashboard");
  await mkdir("artifacts/qa", { recursive: true });
  for (const route of ["/dashboard", "/transactions", "/wallets", "/reports", "/budgets", "/goals", "/settings"]) {
    for (const width of route === "/dashboard" ? [320, 375, 390, 430, 767, 768, 801, 1024, 1440] : [320, 390, 768, 1440]) {
      for (const theme of ["light", "dark"]) {
        await auditViewport(route, width, theme);
        if (width === 390 || width === 1440) await auditAccessibility(route, width, theme);
      }
    }
  }
  await auditInteractions();
  console.log(`PASS authenticated read-only UI audit: ${results.routes.length} route/viewport/theme combinations`);
} catch (error) {
  results.error = error instanceof Error ? error.message : String(error);
  console.error(results.error);
  process.exitCode = 1;
} finally {
  if (target?.id) {
    try { await fetch(new URL(`/json/close/${target.id}`, debuggerUrl), { signal: AbortSignal.timeout(4000) }); } catch { /* Browser may have exited. */ }
  }
  socket?.close();
  await mkdir("artifacts/qa", { recursive: true });
  await writeFile("artifacts/qa/protected-ui-audit.json", JSON.stringify(results, null, 2));
}
