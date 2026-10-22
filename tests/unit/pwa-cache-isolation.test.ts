import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

type FetchEvent = {
  request: { url: string; method: string; mode: string };
  respondWith: (response: Promise<unknown>) => void;
};

function makeWorker() {
  const listeners = new Map<string, (event: FetchEvent) => void>();
  const cacheMatches: string[] = [];
  const networkRequests: string[] = [];
  const offlinePage = { marker: "generic-offline-page" };
  const cachedIcon = { marker: "public-icon" };
  let online = true;

  const caches = {
    match: async (request: string | { url: string }) => {
      const pathname = new URL(typeof request === "string" ? request : request.url, "https://finova.test").pathname;
      cacheMatches.push(pathname);
      if (pathname === "/offline.html") return offlinePage;
      if (pathname === "/brand/icons/finova-app-icon-192.png") return cachedIcon;
      return undefined;
    },
  };
  const source = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");
  runInNewContext(source, {
    URL,
    caches,
    fetch: async (request: { url: string }) => {
      networkRequests.push(request.url);
      if (!online) throw new Error("offline");
      return { marker: "live-network" };
    },
    self: {
      location: { origin: "https://finova.test" },
      addEventListener: (name: string, listener: (event: FetchEvent) => void) => listeners.set(name, listener),
    },
  });

  async function fetchEvent(path: string, mode = "cors", method = "GET") {
    let response: Promise<unknown> | undefined;
    const request = { url: new URL(path, "https://finova.test").href, method, mode };
    listeners.get("fetch")?.({ request, respondWith: (value) => { response = value; } });
    return response;
  }
  return { fetchEvent, setOnline: (state: boolean) => { online = state; }, cacheMatches, networkRequests, offlinePage, cachedIcon };
}

describe("PWA service-worker finance cache isolation", () => {
  it("does not intercept API/finance fetches, cross-origin requests or mutations", async () => {
    const worker = makeWorker();
    expect(await worker.fetchEvent("/api/v1/reports/overview")).toBeUndefined();
    expect(await worker.fetchEvent("/api/auth/get-session")).toBeUndefined();
    expect(await worker.fetchEvent("/dashboard?_rsc=secret")).toBeUndefined();
    expect(await worker.fetchEvent("/brand/icons/finova-app-icon-192.png", "cors", "POST")).toBeUndefined();
    expect(await worker.fetchEvent("https://other.example/private", "navigate")).toBeUndefined();
    expect(worker.cacheMatches).toEqual([]);
    expect(worker.networkRequests).toEqual([]);
  });

  it("uses cache only for declared public assets", async () => {
    const worker = makeWorker();
    expect(await worker.fetchEvent("/brand/icons/finova-app-icon-192.png")).toBe(worker.cachedIcon);
    expect(worker.cacheMatches).toEqual(["/brand/icons/finova-app-icon-192.png"]);
  });

  it("navigates online from network and falls back to a generic page offline", async () => {
    const worker = makeWorker();
    expect(await worker.fetchEvent("/dashboard", "navigate")).toEqual({ marker: "live-network" });
    worker.setOnline(false);
    expect(await worker.fetchEvent("/dashboard", "navigate")).toBe(worker.offlinePage);
    expect(worker.cacheMatches).toEqual(["/offline.html"]);
    expect(worker.networkRequests).toHaveLength(2);
  });
});
