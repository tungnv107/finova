"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { createPageviewTracker } from "@/modules/admin/usage-domain";

// Module scope survives React StrictMode remounts, but resets on a full reload.
const nextPageview = createPageviewTracker();

export function UsagePageview() {
  const pathname = usePathname();
  useEffect(() => {
    const pageview = nextPageview(pathname);
    if (!pageview) return;
    void fetch("/api/v1/usage/pageview", { method: "POST", credentials: "same-origin", keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pageview),
    }).catch(() => { /* Best-effort telemetry must not interrupt navigation. */ });
  }, [pathname]);
  return null;
}
