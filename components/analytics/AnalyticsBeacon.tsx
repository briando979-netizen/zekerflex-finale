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

// ---- attention: how long a page is really looked at -----------------------
// Visible time only (a tab in the background doesn't count), tab switched
// away/back, page left. Same anonymous session id; see lib/analytics/live.ts.

let visibleSince: number | null = null;
let currentPath = "/";

function ping(e: string, extra: Record<string, unknown> = {}) {
  try {
    const body = JSON.stringify({ id: sessionId(), e, p: currentPath, w: window.innerWidth, ...extra });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/analytics/ping", body);
    else void fetch("/api/analytics/ping", { method: "POST", body, keepalive: true }).catch(() => undefined);
  } catch {
    /* ignore */
  }
}

/** Visible milliseconds since the last report, and restart the clock. */
function takeVisible(): number {
  if (visibleSince === null) return 0;
  const now = performance.now();
  const ms = now - visibleSince;
  visibleSince = document.visibilityState === "visible" ? now : null;
  return Math.round(ms);
}

/** For nudges and other on-page prompts: shown / clicked. */
export function pingNudge(id: string, what: "shown" | "click") {
  ping(what === "shown" ? "nudge-shown" : "nudge-click", { n: id });
}

export function AnalyticsBeacon() {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (lastPath.current === pathname) return;
    if (lastPath.current !== null) {
      const ms = takeVisible();
      if (ms > 0) ping("beat", { ms }); // credit the page we're leaving
    }
    currentPath = pathname;
    visibleSince = document.visibilityState === "visible" ? performance.now() : null;
    ping("view", lastPath.current === null && document.referrer ? { r: document.referrer } : {});
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
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        onHide();
        ping("hide", { ms: takeVisible() });
      } else {
        visibleSince = performance.now();
        ping("show");
      }
    };
    const onLeave = () => {
      onHide();
      ping("leave", { ms: takeVisible() });
    };
    const beat = setInterval(() => {
      if (document.visibilityState === "visible") ping("beat", { ms: takeVisible() });
    }, 15_000);
    document.addEventListener("click", onClick, { capture: true });
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onLeave);
    return () => {
      clearInterval(beat);
      document.removeEventListener("click", onClick, { capture: true });
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onLeave);
    };
  }, []);

  return null;
}
