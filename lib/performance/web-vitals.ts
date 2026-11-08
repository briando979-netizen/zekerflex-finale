/**
 * Core Web Vitals tracking via PerformanceObserver
 * LCP (Largest Contentful Paint), FCP (First Contentful Paint), CLS (Cumulative Layout Shift)
 */

import { z } from "zod";

export const webVitalSchema = z.object({
  naam: z.string().min(1),
  waarde: z.number().positive(),
  eenheid: z.enum(["ms", "score"]),
  drempel: z.enum(["goed", "mati", "slecht"]),
  tijdstempel: z.date(),
});

export type WebVital = z.infer<typeof webVitalSchema>;

export interface WebVitalsMetrics {
  lcp?: WebVital;
  fcp?: WebVital;
  cls?: WebVital;
  ttfb?: WebVital;
}

export const LCP_DREMPELS = {
  goed: 2500,
  mati: 4000,
} as const;

export const FCP_DREMPELS = {
  goed: 1800,
  mati: 3000,
} as const;

export const CLS_DREMPELS = {
  goed: 0.1,
  mati: 0.25,
} as const;

export const TTFB_DREMPELS = {
  goed: 600,
  mati: 1200,
} as const;

export function getVitalThreshold(
  naam: string,
  waarde: number,
): "goed" | "mati" | "slecht" {
  if (naam === "LCP") {
    if (waarde <= LCP_DREMPELS.goed) return "goed";
    if (waarde <= LCP_DREMPELS.mati) return "mati";
    return "slecht";
  }

  if (naam === "FCP") {
    if (waarde <= FCP_DREMPELS.goed) return "goed";
    if (waarde <= FCP_DREMPELS.mati) return "mati";
    return "slecht";
  }

  if (naam === "CLS") {
    if (waarde <= CLS_DREMPELS.goed) return "goed";
    if (waarde <= CLS_DREMPELS.mati) return "mati";
    return "slecht";
  }

  if (naam === "TTFB") {
    if (waarde <= TTFB_DREMPELS.goed) return "goed";
    if (waarde <= TTFB_DREMPELS.mati) return "mati";
    return "slecht";
  }

  return "slecht";
}

export function trackWebVital(
  naam: string,
  waarde: number,
  eenheid: "ms" | "score" = "ms",
): WebVital {
  const drempel = getVitalThreshold(naam, waarde);

  return {
    naam,
    waarde,
    eenheid,
    drempel,
    tijdstempel: new Date(),
  };
}

export function calculateWebVitalsScore(metrics: WebVitalsMetrics): number {
  const scores: number[] = [];

  if (metrics.lcp) {
    const normalized = Math.min(1, metrics.lcp.waarde / LCP_DREMPELS.mati);
    scores.push(1 - normalized);
  }

  if (metrics.fcp) {
    const normalized = Math.min(1, metrics.fcp.waarde / FCP_DREMPELS.mati);
    scores.push(1 - normalized);
  }

  if (metrics.cls) {
    const normalized = Math.min(1, metrics.cls.waarde / CLS_DREMPELS.mati);
    scores.push(1 - normalized);
  }

  if (metrics.ttfb) {
    const normalized = Math.min(1, metrics.ttfb.waarde / TTFB_DREMPELS.mati);
    scores.push(1 - normalized);
  }

  if (scores.length === 0) return 0;
  const average = scores.reduce((a, b) => a + b, 0) / scores.length;
  return Math.round(average * 100);
}

export function shouldAlertWebVitals(metrics: WebVitalsMetrics): boolean {
  return !!(
    metrics.lcp?.drempel === "slecht" ||
    metrics.fcp?.drempel === "slecht" ||
    metrics.cls?.drempel === "slecht" ||
    metrics.ttfb?.drempel === "slecht"
  );
}
