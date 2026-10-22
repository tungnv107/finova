/**
 * Unauthenticated login-page and public PWA browser QA using Chrome DevTools Protocol.
 * Uses a fresh temporary Chrome profile and real device emulation. It never
 * signs in or creates financial test data.
 *
 * Start Finova locally, then: npm run test:browser
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const base = new URL(process.env.FINOVA_BROWSER_URL || "http://localhost:3002");
assert.ok(["localhost", "127.0.0.1"].includes(base.hostname), "Browser smoke is local-only");
const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);
const chromePath = chromeCandidates.find(existsSync);
assert.ok(chromePath, "Chrome/Edge executable not found; set CHROME_PATH");

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const profile = await mkdtemp(path.join(os.tmpdir(), "finova-browser-qa-"));
let chrome;
let socket;
const pending = new Map();
let callId = 0;
let googleNavigationObserved = false;
const authNetworkEvents = [];

function command(method, params = {}) {
  const id = ++callId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP ${method} timed out`)); }, 12000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function waitFor(check, description, attempts = 80) {
  for (let i = 0; i < attempts; i++) {
    try {
      const value = await check();
      if (value) return value;
    } catch { /* Chrome may still be starting. */ }
    await delay(150);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function evaluate(expression) {
  const result = await command("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error("Browser evaluation failed");
  return result.result.value;
}

const measurements = [];
try {
  const response = await fetch(new URL("/login", base), { signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 200, "Finova /login must be running");
  const manifestResponse = await fetch(new URL("/manifest.webmanifest", base));
  assert.equal(manifestResponse.status, 200, "PWA manifest must be served");
  const manifest = await manifestResponse.json();
  assert.equal(manifest.display, "standalone", "PWA display mode");
  assert.equal(manifest.start_url, "/dashboard", "PWA start URL");
  for (const icon of manifest.icons) {
    const iconResponse = await fetch(new URL(icon.src, base));
    assert.equal(iconResponse.status, 200, `PWA icon ${icon.src} must load`);
    assert.ok(iconResponse.headers.get("content-type")?.startsWith("image/"), "PWA icon content type");
  }
  chrome = spawn(chromePath, [
    "--headless=new", "--no-first-run", "--no-default-browser-check",
    "--disable-extensions", "--disable-background-networking", "--remote-debugging-port=0",
    `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: "ignore" });

  const active = path.join(profile, "DevToolsActivePort");
  const port = await waitFor(async () => {
    if (!existsSync(active)) return null;
    const value = (await readFile(active, "utf8")).split(/\r?\n/)[0];
    return Number(value) || null;
  }, "Chrome debugger");
  const target = await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`);
    const tabs = await response.json();
    return tabs.find(tab => tab.type === "page" && tab.webSocketDebuggerUrl);
  }, "Chrome page target");
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (message.method === "Network.requestWillBeSent") {
      const url = message.params?.request?.url;
      if (typeof url === "string") {
        try {
          const parsed = new URL(url);
          if (parsed.pathname.includes("/api/auth/") || parsed.hostname === "accounts.google.com") {
            authNetworkEvents.push(`${parsed.origin}${parsed.pathname}`);
          }
        } catch { /* Ignore non-URL DevTools events. */ }
      }
      if (typeof url === "string" && url.startsWith("https://accounts.google.com/o/oauth2/v2/auth?")) {
        googleNavigationObserved = true;
      }
    }
    if (!message.id || !pending.has(message.id)) return;
    const waiter = pending.get(message.id);
    pending.delete(message.id);
    clearTimeout(waiter.timer);
    if (message.error) waiter.reject(new Error(`CDP ${message.error.message}`));
    else waiter.resolve(message.result);
  });
  await command("Page.enable");
  await command("Runtime.enable");
  await command("Network.enable");

  await mkdir("artifacts/qa", { recursive: true });
  for (const viewport of [
    { name: "desktop", width: 1440, height: 900, mobile: false },
    { name: "laptop", width: 1280, height: 800, mobile: false },
    { name: "desktop-boundary", width: 1024, height: 800, mobile: false },
    { name: "tablet-large-boundary", width: 801, height: 1000, mobile: false },
    { name: "tablet-small-boundary", width: 800, height: 1000, mobile: false },
    { name: "tablet", width: 768, height: 1024, mobile: true },
    { name: "mobile-boundary", width: 767, height: 1024, mobile: true },
    { name: "large-mobile", width: 430, height: 932, mobile: true },
    { name: "mobile", width: 390, height: 844, mobile: true },
    { name: "medium-mobile", width: 375, height: 667, mobile: true },
    { name: "compact-mobile", width: 360, height: 740, mobile: true },
    { name: "small-mobile", width: 320, height: 700, mobile: true },
    { name: "small-mobile-short", width: 320, height: 568, mobile: true },
  ]) {
    await command("Emulation.setDeviceMetricsOverride", {
      width: viewport.width, height: viewport.height,
      deviceScaleFactor: 1, mobile: viewport.mobile,
    });
    await command("Page.navigate", { url: new URL("/login", base).href });
    await waitFor(async () => await evaluate("document.readyState === 'complete' && !!document.querySelector('.google-btn')"), "login page");
    await delay(350);
    const metrics = await evaluate(`(() => {
      const elements = ['.login-page', '.login-hero', '.login-panel', '.login-hero h1', '.login-hero p', '.login-box h2', '.google-btn', '.login-footnote'];
      return {
        viewport: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        buttonEnabled: !document.querySelector('.google-btn').disabled,
        buttonHeight: document.querySelector('.google-btn').getBoundingClientRect().height,
        language: document.documentElement.lang,
        headings: document.querySelectorAll('h1').length,
        stylesheetApplied: getComputedStyle(document.querySelector('.login-page')).display === 'grid'
          && getComputedStyle(document.querySelector('.google-btn')).display === 'flex'
          && getComputedStyle(document.body).fontFamily.includes('Be Vietnam Pro'),
        logoLoaded: document.querySelector('.login-brand-plaque img')?.naturalWidth > 0,
        logoBacking: getComputedStyle(document.querySelector('.login-brand-plaque')).backgroundColor,
        offscreen: elements.filter(selector => {
          const el = document.querySelector(selector);
          if (!el) return true;
          const rect = el.getBoundingClientRect();
          return rect.left < -1 || rect.right > window.innerWidth + 1 || el.scrollWidth > el.clientWidth + 1;
        }),
      };
    })()`);
    assert.equal(metrics.viewport, viewport.width, `${viewport.name}: viewport emulation`);
    assert.ok(metrics.documentWidth <= viewport.width + 1, `${viewport.name}: page overflows horizontally (${metrics.documentWidth}px)`);
    assert.equal(metrics.stylesheetApplied, true, `${viewport.name}: Finova stylesheet must load`);
    assert.equal(metrics.logoLoaded, true, `${viewport.name}: official logo must load`);
    assert.equal(metrics.logoBacking, "rgb(255, 255, 255)", `${viewport.name}: logo needs a readable light surface`);
    assert.deepEqual(metrics.offscreen, [], `${viewport.name}: clipped login elements`);
    assert.equal(metrics.buttonEnabled, true, `${viewport.name}: Google sign-in must be enabled`);
    assert.ok(metrics.buttonHeight >= 44, `${viewport.name}: touch target at least 44px`);
    assert.equal(metrics.language, "vi", `${viewport.name}: document language`);
    assert.equal(metrics.headings, 1, `${viewport.name}: one page heading`);
    const screenshot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(`artifacts/qa/login-${viewport.name}-verified.png`, Buffer.from(screenshot.data, "base64"));
    if ([320, 390, 430, 1440].includes(viewport.width)) {
      for (const theme of ["light", "dark"]) {
        await evaluate(`localStorage.setItem('finova-theme', '${theme}')`);
        await command("Page.navigate", { url: new URL("/login", base).href });
        await waitFor(async () => await evaluate(`document.readyState === 'complete' && document.documentElement.dataset.theme === '${theme}' && !!document.querySelector('.google-btn')`), `${theme} theme reload`);
        const themedMetrics = await evaluate(`({ documentWidth: document.documentElement.scrollWidth, viewport: window.innerWidth, logo: getComputedStyle(document.querySelector('.login-brand-plaque')).backgroundColor })`);
        assert.ok(themedMetrics.documentWidth <= themedMetrics.viewport + 1, `${viewport.name} ${theme}: horizontal overflow`);
        assert.equal(themedMetrics.logo, "rgb(255, 255, 255)", `${viewport.name} ${theme}: logo contrast surface`);
        const themedScreenshot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
        await writeFile(`artifacts/qa/login-${viewport.name}-${theme}-verified.png`, Buffer.from(themedScreenshot.data, "base64"));
      }
      await evaluate("localStorage.setItem('finova-theme', 'system')");
    }
    measurements.push({ viewport: viewport.name, ...metrics });
    console.log(`PASS: ${viewport.name} ${viewport.width}x${viewport.height}, no horizontal overflow, Google button enabled`);
  }
  // Programmatic .focus() does not necessarily match :focus-visible; use real Tab key events.
  await command("Runtime.evaluate", { expression: "document.activeElement?.blur()" });
  let keyboardFocused = false;
  for (let i = 0; i < 10 && !keyboardFocused; i++) {
    await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    keyboardFocused = await evaluate("document.activeElement?.matches('.google-btn') === true");
  }
  assert.equal(keyboardFocused, true, "Google button must be reachable using Tab");
  const focus = await evaluate(`(() => {
    const button = document.querySelector('.google-btn');
    const style = getComputedStyle(button);
    return { focused: document.activeElement === button, outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
  })()`);
  assert.equal(focus.focused, true, "Google button must be focusable");
  assert.notEqual(focus.outlineStyle, "none", "Google button must show a focus indicator");
  assert.notEqual(focus.outlineWidth, "0px", "Google button focus indicator width");

  // WCAG checks run locally against the rendered page. No external axe CDN or
  // analytics endpoint is used, and only violation metadata is persisted.
  const axeSource = await readFile("node_modules/axe-core/axe.min.js", "utf8");
  const a11y = [];
  const performance = [];
  for (const viewport of [{ width: 390, height: 844, mobile: true }, { width: 1440, height: 900, mobile: false }]) {
    await command("Emulation.setDeviceMetricsOverride", { ...viewport, deviceScaleFactor: 1 });
    for (const theme of ["light", "dark"]) {
      await evaluate(`localStorage.setItem('finova-theme', '${theme}')`);
      await command("Page.navigate", { url: new URL("/login", base).href });
      await waitFor(() => evaluate(`document.readyState === 'complete' && document.documentElement.dataset.theme === '${theme}' && !!document.querySelector('.google-btn')`), `${viewport.width}px ${theme} login`);
      await delay(500);
      await evaluate(axeSource);
      const violations = await evaluate(`axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa'] } }).then(r => r.violations.map(v => ({ id: v.id, impact: v.impact, count: v.nodes.length, selectors: v.nodes.map(n => n.target.join(' ')), contrast: v.nodes.map(n => n.any.map(c => c.data).filter(Boolean)) })))`);
      a11y.push({ viewport: viewport.width, theme, violations });
      console.log(`WCAG check: login ${viewport.width}px ${theme}: ${violations.length} rules with violations`);
      const severe = violations.filter(v => v.impact === "serious" || v.impact === "critical");
      if (severe.length) console.error("WCAG serious findings:", JSON.stringify(severe));
      assert.deepEqual(severe, [], `${viewport.width}px ${theme}: serious WCAG violations`);
      const timings = await evaluate(`(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        const fcp = performance.getEntriesByName('first-contentful-paint')[0];
        return { responseStartMs: nav?.responseStart ?? null, domContentLoadedMs: nav?.domContentLoadedEventEnd ?? null, fcpMs: fcp?.startTime ?? null };
      })()`);
      performance.push({ viewport: viewport.width, theme, ...timings });
    }
  }
  // Verify a live OS color-scheme change while Finova is in System mode.
  await evaluate("localStorage.setItem('finova-theme', 'system')");
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
  await command("Page.navigate", { url: new URL("/login", base).href });
  await waitFor(() => evaluate("document.readyState === 'complete' && document.documentElement.dataset.theme === 'dark'"), "system dark theme");
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
  await waitFor(() => evaluate("document.documentElement.dataset.theme === 'light'"), "live OS theme change to light");
  await command("Emulation.setEmulatedMedia", { features: [] });
  console.log("PASS: System theme follows OS changes on the public login page");

  // A fresh Chrome profile isolates the PWA cache from previously visited sites.
  const pwa = await waitFor(async () => {
    const value = await evaluate(`(async () => {
      if (!('serviceWorker' in navigator)) return null;
      const registration = await navigator.serviceWorker.ready;
      const names = await caches.keys();
      const paths = [];
      for (const name of names) {
        const entries = await (await caches.open(name)).keys();
        for (const entry of entries) paths.push(new URL(entry.url).pathname);
      }
      return { scope: registration.scope, names, paths };
    })()`);
    return value?.paths.length ? value : null;
  }, "public PWA service worker and precache");
  assert.deepEqual(pwa.names, ["finova-public-v1"], "PWA must only create its public cache");
  assert.deepEqual(pwa.paths.sort(), ["/offline.html", "/brand/icons/finova-app-icon-192.png", "/brand/icons/finova-app-icon-512.png"].sort(), "Only approved public assets may be cached");
  console.log("PASS: PWA manifest/icons, public-only cache, login focus and 44px touch target");
  // Dispatch an actual Chrome input event; an untrusted DOM .click() can behave
  // differently from a real user interaction during OAuth navigation.
  const bounds = await evaluate(`(() => { const r = document.querySelector('.google-btn').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await command("Input.dispatchMouseEvent", { type: "mousePressed", x: bounds.x, y: bounds.y, button: "left", clickCount: 1 });
  await command("Input.dispatchMouseEvent", { type: "mouseReleased", x: bounds.x, y: bounds.y, button: "left", clickCount: 1 });
  try {
    await waitFor(() => googleNavigationObserved, "Google OAuth navigation from login button", 60);
  } catch (error) {
    const state = await evaluate(`({ button: document.querySelector('.google-btn')?.textContent, error: document.querySelector('.login-box .form-error')?.textContent || null, path: location.pathname })`).catch(() => null);
    console.error("OAuth browser state:", state, "Auth request paths:", authNetworkEvents.slice(-12));
    throw error;
  }
  console.log("PASS: clicking Google sign-in initiates browser navigation to Google's OAuth endpoint");
  await writeFile("artifacts/qa/browser-smoke.json", JSON.stringify({ measurements, a11y, performance, focus, pwa, manifest: { name: manifest.name, display: manifest.display, start_url: manifest.start_url } }, null, 2));
} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    try { await command("Browser.close"); } catch { /* Process cleanup below. */ }
    socket.close();
  }
  if (chrome && chrome.exitCode === null) chrome.kill();
  try { await rm(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 }); } catch { /* Windows may keep Chrome profile locked briefly. */ }
}
