/**
 * Mobile Metrics Subsystem
 *
 * Core Web Vitals tracking: FCP, LCP, CLS, FID, INP, TTFB.
 * Uses PerformanceObserver API for continuous monitoring.
 * Reports metrics to backend for analysis.
 */

import { logger } from "@/lib/logger";

// ===== Types =====

export interface CoreWebVitals {
  fcp?: number; // First Contentful Paint
  lcp?: number; // Largest Contentful Paint
  cls?: number; // Cumulative Layout Shift
  fid?: number; // First Input Delay (deprecated but tracked)
  inp?: number; // Interaction to Next Paint
  ttfb?: number; // Time to First Byte
}

export interface MetricsContext {
  routePath: string;
  deviceType: "mobile" | "tablet" | "desktop";
  connectionType: string;
}

export interface PerformanceMetric {
  name: string;
  value: number;
  rating: "good" | "needs-improvement" | "poor";
  timestamp: number;
}

// ===== Metrics Collection =====

const metrics: Map<string, number> = new Map();
let sessionId: string = "";
let perfObserver: PerformanceObserver | null = null;

/**
 * Initialize metrics collection and observers
 */
export function initMetricsCollection(userId: string): void {
  if (typeof window === "undefined") return;

  // Generate session ID
  sessionId = `${userId}-${Date.now()}-${Math.random().toString(36).substring(7)}`;

  // Observe Navigation Timing (TTFB)
  try {
    const navTiming = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    if (navTiming) {
      metrics.set("ttfb", navTiming.responseStart - navTiming.requestStart);
    }
  } catch {
    /* Browser doesn't support Navigation Timing */
  }

  // Create PerformanceObserver for Paint Timing
  try {
    perfObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === "paint") {
          if (entry.name === "first-contentful-paint") {
            metrics.set("fcp", entry.startTime);
          }
        } else if (entry.entryType === "largest-contentful-paint") {
          metrics.set("lcp", entry.startTime);
        } else if (entry.entryType === "layout-shift") {
          const cls = (metrics.get("cls") || 0) + (entry as PerformanceEntryWithValue).value;
          metrics.set("cls", cls);
        } else if (entry.entryType === "first-input") {
          metrics.set("fid", (entry as PerformanceEntryWithValue).processingDuration);
        } else if (entry.entryType === "event") {
          const inp = (entry as PerformanceEntryWithValue).duration;
          if (!metrics.has("inp") || inp > (metrics.get("inp") || 0)) {
            metrics.set("inp", inp);
          }
        }
      }
    });

    perfObserver.observe({
      entryTypes: [
        "paint",
        "largest-contentful-paint",
        "layout-shift",
        "first-input",
        "event",
      ],
    });
  } catch (error) {
    logger.debug("PerformanceObserver not available", {
      error: (error as Error).message,
    });
  }
}

/**
 * Stop metrics collection
 */
export function stopMetricsCollection(): void {
  if (perfObserver) {
    perfObserver.disconnect();
    perfObserver = null;
  }
}

/**
 * Get collected metrics snapshot
 */
export function getMetricsSnapshot(): CoreWebVitals {
  return {
    fcp: metrics.get("fcp"),
    lcp: metrics.get("lcp"),
    cls: metrics.get("cls"),
    fid: metrics.get("fid"),
    inp: metrics.get("inp"),
    ttfb: metrics.get("ttfb"),
  };
}

// ===== Metrics Rating =====

/**
 * Rate a metric value against thresholds
 */
export function rateMetric(name: string, value: number): "good" | "needs-improvement" | "poor" {
  const thresholds: Record<string, { good: number; poor: number }> = {
    fcp: { good: 1800, poor: 3000 },
    lcp: { good: 2500, poor: 4000 },
    cls: { good: 0.1, poor: 0.25 },
    fid: { good: 100, poor: 300 },
    inp: { good: 200, poor: 500 },
    ttfb: { good: 600, poor: 1800 },
  };

  const t = thresholds[name];
  if (!t) return "needs-improvement";

  return value <= t.good ? "good" : value <= t.poor ? "needs-improvement" : "poor";
}

/**
 * Get overall page grade
 */
export function getPageGrade(vitals: CoreWebVitals): number {
  let score = 100;
  let count = 0;

  const deductions: Record<string, number> = {
    fcp: vitals.fcp ? (vitals.fcp > 1800 ? (vitals.fcp > 3000 ? 20 : 10) : 0) : 0,
    lcp: vitals.lcp ? (vitals.lcp > 2500 ? (vitals.lcp > 4000 ? 25 : 15) : 0) : 0,
    cls: vitals.cls ? (vitals.cls > 0.1 ? (vitals.cls > 0.25 ? 25 : 10) : 0) : 0,
    fid: vitals.fid ? (vitals.fid > 100 ? (vitals.fid > 300 ? 20 : 10) : 0) : 0,
    inp: vitals.inp ? (vitals.inp > 200 ? (vitals.inp > 500 ? 20 : 10) : 0) : 0,
  };

  for (const [key, deduction] of Object.entries(deductions)) {
    if ((vitals as Record<string, unknown>)[key] !== undefined) {
      score -= deduction;
      count++;
    }
  }

  return Math.max(0, score);
}

// ===== Reporting =====

/**
 * Report metrics to backend
 */
export async function reportMetrics(
  userId: string,
  context: MetricsContext,
): Promise<void> {
  const vitals = getMetricsSnapshot();

  try {
    await fetch("/api/mobile/metrics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        userId,
        metrics: vitals,
        grade: getPageGrade(vitals),
        context,
        timestamp: Date.now(),
      }),
    });

    logger.debug("Metrics reported", {
      route: context.routePath,
      grade: getPageGrade(vitals),
    });
  } catch (error) {
    logger.warn("Failed to report metrics", {
      error: (error as Error).message,
    });
  }
}

/**
 * Report a single metric update (for continuous monitoring)
 */
export async function reportMetricUpdate(
  userId: string,
  metric: PerformanceMetric,
): Promise<void> {
  try {
    await fetch("/api/mobile/metrics/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        userId,
        metric,
        timestamp: Date.now(),
      }),
    });
  } catch (error) {
    logger.debug("Failed to report metric update", {
      error: (error as Error).message,
    });
  }
}

// ===== Session Tracking =====

/**
 * Record mobile session
 */
export async function recordMobileSession(
  userId: string,
  metrics: CoreWebVitals,
): Promise<void> {
  try {
    const response = await fetch("/api/mobile/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        sessionId,
        metrics,
        userAgent: navigator.userAgent,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    logger.warn("Failed to record session", {
      error: (error as Error).message,
      userId,
    });
  }
}

/**
 * End mobile session
 */
export async function endMobileSession(userId: string): Promise<void> {
  try {
    await fetch("/api/mobile/sessions/end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        sessionId,
        metrics: getMetricsSnapshot(),
        duration: Date.now(),
      }),
    });
  } catch (error) {
    logger.debug("Failed to end session", {
      error: (error as Error).message,
    });
  }
}

// ===== Device Detection =====

export function detectDeviceType(): "mobile" | "tablet" | "desktop" {
  if (typeof window === "undefined") return "desktop";

  const width = window.innerWidth;

  if (width < 768) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

export function detectConnectionType(): string {
  if (typeof navigator === "undefined") return "unknown";

  const connection = (navigator as Record<string, unknown>).connection as
    | { effectiveType: string }
    | undefined;

  if (connection?.effectiveType) {
    return connection.effectiveType; // 4g, 3g, 2g, slow-2g
  }

  return "unknown";
}

// ===== Backend-Side Session Management (for API) =====

import { prisma } from "@/lib/prisma";

/**
 * Store metrics in database (called by /api/mobile/metrics)
 */
export async function storeMetrics(
  userId: string,
  sessionId: string,
  metrics: CoreWebVitals,
  context: MetricsContext,
  timestamp: number,
): Promise<void> {
  try {
    // Update or create session
    const session = await prisma.mobileSession.upsert({
      where: { sessionId },
      create: {
        userId,
        sessionId,
        metricsCount: 1,
        avgLcp: metrics.lcp,
        avgCls: metrics.cls,
      },
      update: {
        metricsCount: { increment: 1 },
        avgLcp: metrics.lcp ? (metrics.lcp + ((session as unknown) as {avgLcp: number}).avgLcp) / 2 : undefined,
      },
    }).catch(() => null);

    // Store individual metric
    await prisma.mobileMetrics.create({
      data: {
        userId,
        fcp: metrics.fcp,
        lcp: metrics.lcp,
        cls: metrics.cls,
        fid: metrics.fid,
        inp: metrics.inp,
        ttfb: metrics.ttfb,
        pageUrl: context.routePath,
        routePath: context.routePath,
        deviceType: context.deviceType,
        connectionType: context.connectionType,
        sessionId,
        timestamp: new Date(timestamp),
      },
    });
  } catch (error) {
    logger.warn("Failed to store metrics", {
      error: (error as Error).message,
      userId,
    });
  }
}

/**
 * Clean up old metrics (run in cron)
 */
export async function cleanupOldMetrics(daysToKeep: number = 30): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);

    const result = await prisma.mobileMetrics.deleteMany({
      where: {
        createdAt: { lt: cutoff },
      },
    });

    logger.info("Cleaned up old metrics", { count: result.count });
    return result.count;
  } catch (error) {
    logger.error("Metrics cleanup failed", {
      error: (error as Error).message,
    });
    return 0;
  }
}

// ===== Type Extensions =====

interface PerformanceEntryWithValue extends PerformanceEntry {
  value?: number;
  processingDuration?: number;
  duration: number;
}
