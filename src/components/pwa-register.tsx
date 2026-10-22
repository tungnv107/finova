"use client";

import { useEffect } from "react";

/** Register a privacy-preserving worker: no authenticated HTML/API caching. */
export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator && window.isSecureContext) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // PWA is optional; online financial workflows remain available.
      });
    }
  }, []);
  return null;
}
