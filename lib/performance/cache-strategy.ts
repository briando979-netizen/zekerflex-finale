/**
 * Cache strategy — HTTP headers, CDN optimization, Redis invalidation
 */

import { z } from "zod";

export const cacheBeleidsSchema = z.object({
  pad: z.string(),
  maxAge: z.number().nonnegative(),
  sMaxAge: z.number().nonnegative().optional(),
  staleWhileRevalidate: z.number().nonnegative().optional(),
  isPrivé: z.boolean().default(false),
  immutable: z.boolean().default(false),
});

export type CachePolicy = z.infer<typeof cacheBeleidsSchema>;

export interface CacheMetrics {
  treffer: number;
  miss: number;
  invalidaties: number;
}

export const CACHE_STRATEGIES = {
  STATISCH: {
    maxAge: 31536000, // 1 jaar
    sMaxAge: 31536000,
    immutable: true,
  },
  PAGINA: {
    maxAge: 3600, // 1 uur
    sMaxAge: 86400, // 1 dag
    staleWhileRevalidate: 604800, // 1 week
  },
  API: {
    maxAge: 60, // 1 minuut
    sMaxAge: 300, // 5 minuten
    isPrivé: true,
  },
  GEEN: {
    maxAge: 0,
    isPrivé: true,
  },
} as const;

export function generateCacheHeaders(beleid: CachePolicy): Record<string, string> {
  const headers: Record<string, string> = {};

  const richtlijnen: string[] = [];

  if (beleid.isPrivé) {
    richtlijnen.push("private");
  } else {
    richtlijnen.push("public");
  }

  richtlijnen.push(`max-age=${beleid.maxAge}`);

  if (beleid.sMaxAge !== undefined) {
    richtlijnen.push(`s-maxage=${beleid.sMaxAge}`);
  }

  if (beleid.staleWhileRevalidate !== undefined) {
    richtlijnen.push(`stale-while-revalidate=${beleid.staleWhileRevalidate}`);
  }

  if (beleid.immutable) {
    richtlijnen.push("immutable");
  }

  headers["Cache-Control"] = richtlijnen.join(", ");

  return headers;
}

export function getCacheStrategyForPath(pad: string): CachePolicy {
  if (pad.startsWith("/api/")) {
    return { pad, ...CACHE_STRATEGIES.API };
  }

  if (
    pad.match(/\.(js|css|woff2|png|jpg|svg|webp)$/i) ||
    pad.includes("/_next/")
  ) {
    return { pad, ...CACHE_STRATEGIES.STATISCH };
  }

  if (pad.startsWith("/dashboard") || pad.startsWith("/werkgever") || pad.startsWith("/admin")) {
    return { pad, ...CACHE_STRATEGIES.GEEN };
  }

  return { pad, ...CACHE_STRATEGIES.PAGINA };
}

export function calculateCacheHitRate(metrics: CacheMetrics): number {
  const totaal = metrics.treffer + metrics.miss;
  if (totaal === 0) return 0;
  return (metrics.treffer / totaal) * 100;
}

export function shouldInvalidateCache(
  invalidaties: number,
  voorgekomen: number,
): boolean {
  if (invalidaties === 0) return false;
  const invalidatieSnelheid = invalidaties / voorgekomen;
  return invalidatieSnelheid > 0.5;
}

export class RedisInvalidationStrategy {
  private prefix: string;

  constructor(prefix: string = "cache") {
    this.prefix = prefix;
  }

  generateKey(entiteit: string, id: string): string {
    return `${this.prefix}:${entiteit}:${id}`;
  }

  generatePatternForEntity(entiteit: string): string {
    return `${this.prefix}:${entiteit}:*`;
  }

  generatePatternForUser(userId: string): string {
    return `${this.prefix}:user:${userId}:*`;
  }

  invalidateEntity(entiteit: string): string {
    return this.generatePatternForEntity(entiteit);
  }

  invalidateUser(userId: string): string {
    return this.generatePatternForUser(userId);
  }

  invalidateAll(): string {
    return `${this.prefix}:*`;
  }
}

export const cdnOptimalisatie = {
  enableGzip: true,
  enableBrotli: true,
  enableWebP: true,
  preferredImageFormats: ["webp", "png", "jpg"],
  enableMinification: true,
};
