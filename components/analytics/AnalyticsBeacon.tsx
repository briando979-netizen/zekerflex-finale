"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// ---------------------------------------------------------------------------
// Sovereign analytics beacon. Cookie-free: the session id is a random string
// in sessionStorage (per tab, cleared when the tab closes). Sends pageviews on
// navigation and clicks on elements marked `data-track` (or plain buttons /
// links). Batched, best-effort, never blocks the page.
// ---------------------------------------------------------------------------

const SESSION_KEY = "zekerflex.analytics.sid";

interface QueuedEvent {
  type: "PAGEVIEW" | "CLICK" | "INTERACTION" | "CUSTOM";
  path: string;
  label?: string | undefined;
  referrer?: string | undefined;
  meta?: Record<string, unknown> | undefined;
}

function sessionId(): string {
  try {
    let sid = sessionStorage.getItem(SESSION_KEY);
    if (!sid) {
      sid =
        (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(
          /-/g,
          "",
        );
      sessionStorage.setItem(SESSION_KEY, sid);
    }
    return sid;
  } catch {
    return "no-storage";
  }
}

let queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function flush(useBeacon = false) {
  if (queue.length === 0) return;
  const batch = queue.splice(0, 20);
  const body = JSON.stringify({ sessionId: sessionId(), events: batch });
  try {
    if (useBeacon && navigator.sendBeacon) {
      navigator.sendBeacon(
        "/api/analytics/track",
        new Blob([body], { type: "application/json" }),
      );
    } else {
      void fetch("/api/analytics/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => undefined);
    }
  } catch {
    /* ignore */
  }
}

function enqueue(e: QueuedEvent) {
  queue.push(e);
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush();
  }, 1500);
}

export function trackEvent(
  type: QueuedEvent["type"],
  label?: string,
  meta?: Record<string, unknown>,
) {
  enqueue({
    type,
    path: typeof location !== "undefined" ? location.pathname : "/",
    ...(label ? { label } : {}),
    ...(meta ? { meta } : {}),
  });
}

export function AnalyticsBeacon() {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    enqueue({
      type: "PAGEVIEW",
      path: pathname,
      referrer: document.referrer || undefined,
    });
  }, [pathname]);

  useEffect(() => {
    const onClick = (ev: MouseEvent) => {
      const el = (ev.target as HTMLElement | null)?.closest<HTMLElement>(
        "[data-track], button, a",
      );
      if (!el) return;
      const label =
        el.getAttribute("data-track") ||
        el.getAttribute("aria-label") ||
        el.textContent?.trim().slice(0, 60) ||
        el.tagName.toLowerCase();
      enqueue({ type: "CLICK", path: location.pathname, label });
    };
    const onHide = () => flush(true);
    document.addEventListener("click", onClick, { capture: true });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") onHide();
    });
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("click", onClick, { capture: true });
      window.removeEventListener("pagehide", onHide);
    };
  }, []);

  return null;
}
