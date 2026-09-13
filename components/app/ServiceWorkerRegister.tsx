"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js once per load. The worker gives us the PWA install prompt,
 * an offline fallback, and — the reason it exists — a `push` handler so the
 * self-hosted Web Push channel actually delivers (lib/notifications/push is
 * the send side; without a worker nothing receives).
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV === "development") return; // HMR + SW fight
    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
        // Non-fatal — the app works fine without it, push just won't arrive.
        console.warn("service worker registration failed", err);
      });
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
