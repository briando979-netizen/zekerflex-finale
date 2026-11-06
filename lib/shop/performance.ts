// Performance optimization utilities

export interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  timestamp: Date;
  status: "good" | "warning" | "critical";
}

export interface PagePerformance {
  url: string;
  fcp: number; // First Contentful Paint (ms)
  lcp: number; // Largest Contentful Paint (ms)
  cls: number; // Cumulative Layout Shift (0-1)
  ttfb: number; // Time to First Byte (ms)
  fid: number; // First Input Delay (ms)
}

export const PERFORMANCE_TARGETS = {
  fcp: 1800, // ms
  lcp: 2500, // ms
  cls: 0.1,
  ttfb: 600, // ms
  fid: 100, // ms
};

export function getPerformanceStatus(metric: number, target: number): "good" | "warning" | "critical" {
  if (metric <= target * 0.75) return "good";
  if (metric <= target) return "warning";
  return "critical";
}

export function optimizeImageUrl(url: string, width?: number, quality?: number): string {
  // Return WebP version with resize parameters
  if (!url) return url;
  const ext = url.split(".").pop();
  if (ext === "webp") return url;
  return `${url.replace(/\.[^.]+$/, ".webp")}${width ? `?w=${width}` : ""}${quality ? `&q=${quality}` : ""}`;
}

export function generateSrcSet(url: string): string {
  return [320, 640, 1280, 1920]
    .map((w) => `${optimizeImageUrl(url, w)} ${w}w`)
    .join(", ");
}

export function cacheKey(route: string, params?: Record<string, any>): string {
  const query = params ? `?${new URLSearchParams(params).toString()}` : "";
  return `cache:${route}${query}`;
}

export const CACHE_DURATIONS = {
  product: 3600, // 1 hour
  category: 7200, // 2 hours
  search: 1800, // 30 minutes
  user: 300, // 5 minutes
  static: 86400, // 24 hours
};
