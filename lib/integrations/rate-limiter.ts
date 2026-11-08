/**
 * Rate Limiting — Per-integration quotas, backoff strategies, and throttling
 * Manages API rate limits and prevents overload of external services.
 */

import { prisma } from "@/lib/prisma";
import { RateLimitQuota } from "@prisma/client";

export type QuotaType = "requests_per_minute" | "calls_per_day" | "concurrent_requests";

export interface RateLimitConfig {
  connectorName: string;
  limits: Record<QuotaType, number>;
  backoffStrategy: "linear" | "exponential";
  maxBackoffMs?: number;
}

/**
 * Initialize rate limit quota for a connector
 */
export async function initializeRateLimit(
  tenantId: string,
  connectorName: string,
  quotaType: QuotaType,
  limit: number,
  windowSizeSeconds: number = 60
): Promise<RateLimitQuota> {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + windowSizeSeconds * 1000);

  return prisma.rateLimitQuota.upsert({
    where: {
      tenantId_connectorName_quotaType: {
        tenantId,
        connectorName: connectorName.toLowerCase(),
        quotaType,
      },
    },
    update: {},
    create: {
      tenantId,
      connectorName: connectorName.toLowerCase(),
      quotaType,
      limit,
      windowSize: windowSizeSeconds,
      windowStart: now,
      windowEnd,
    },
  });
}

/**
 * Check if a request is allowed under rate limits
 */
export async function checkRateLimit(
  tenantId: string,
  connectorName: string,
  quotaType: QuotaType = "requests_per_minute"
): Promise<{
  allowed: boolean;
  remaining: number;
  retryAfterSeconds?: number;
}> {
  const quota = await prisma.rateLimitQuota.findUnique({
    where: {
      tenantId_connectorName_quotaType: {
        tenantId,
        connectorName: connectorName.toLowerCase(),
        quotaType,
      },
    },
  });

  if (!quota) {
    // No quota configured, allow by default
    return { allowed: true, remaining: Infinity };
  }

  const now = new Date();

  // Check if window has expired
  if (now > quota.windowEnd) {
    // Reset window
    const newWindowEnd = new Date(now.getTime() + quota.windowSize * 1000);
    await prisma.rateLimitQuota.update({
      where: { id: quota.id },
      data: {
        windowStart: now,
        windowEnd: newWindowEnd,
        requestCount: 0,
        isBackingOff: false,
        backoffUntil: null,
      },
    });

    return {
      allowed: true,
      remaining: quota.limit,
    };
  }

  // Check if currently backing off
  if (quota.isBackingOff && quota.backoffUntil) {
    if (now < quota.backoffUntil) {
      const retryAfterSeconds = Math.ceil(
        (quota.backoffUntil.getTime() - now.getTime()) / 1000
      );
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds,
      };
    }

    // Backoff period expired, resume normal operation
    await prisma.rateLimitQuota.update({
      where: { id: quota.id },
      data: {
        isBackingOff: false,
        backoffUntil: null,
        backoffMultiplier: 1.0,
      },
    });
  }

  // Check if under limit
  if (quota.requestCount < quota.limit) {
    return {
      allowed: true,
      remaining: quota.limit - quota.requestCount,
    };
  }

  // Limit exceeded, initiate backoff
  const backoffMs = calculateBackoffDuration(
    quota.limit,
    quota.backoffMultiplier,
    60000 // Start with 1 minute
  );

  const backoffUntil = new Date(now.getTime() + backoffMs);

  await prisma.rateLimitQuota.update({
    where: { id: quota.id },
    data: {
      isBackingOff: true,
      backoffUntil,
      backoffMultiplier: Math.min(quota.backoffMultiplier * 2, 32), // Cap at 32x
    },
  });

  return {
    allowed: false,
    remaining: 0,
    retryAfterSeconds: Math.ceil(backoffMs / 1000),
  };
}

/**
 * Record a request against rate limit
 */
export async function recordRequest(
  tenantId: string,
  connectorName: string,
  quotaType: QuotaType = "requests_per_minute"
): Promise<void> {
  await prisma.rateLimitQuota.updateMany({
    where: {
      tenantId,
      connectorName: connectorName.toLowerCase(),
      quotaType,
    },
    data: {
      requestCount: {
        increment: 1,
      },
      lastRequestAt: new Date(),
    },
  });
}

/**
 * Get current rate limit status
 */
export async function getRateLimitStatus(
  tenantId: string,
  connectorName: string
): Promise<
  | {
      connector: string;
      quotas: Array<{
        type: QuotaType;
        limit: number;
        used: number;
        remaining: number;
        resetTime: Date;
        isBackingOff: boolean;
      }>;
    }
  | undefined
> {
  const quotas = await prisma.rateLimitQuota.findMany({
    where: {
      tenantId,
      connectorName: connectorName.toLowerCase(),
    },
  });

  if (quotas.length === 0) {
    return undefined;
  }

  return {
    connector: connectorName,
    quotas: quotas.map((q) => ({
      type: q.quotaType as QuotaType,
      limit: q.limit,
      used: q.requestCount,
      remaining: Math.max(0, q.limit - q.requestCount),
      resetTime: q.windowEnd,
      isBackingOff: q.isBackingOff,
    })),
  };
}

/**
 * Wait for rate limit to allow a request
 */
export async function waitForRateLimit(
  tenantId: string,
  connectorName: string,
  quotaType: QuotaType = "requests_per_minute",
  maxWaitMs: number = 300000 // 5 minutes
): Promise<void> {
  const startTime = Date.now();

  while (true) {
    const result = await checkRateLimit(tenantId, connectorName, quotaType);

    if (result.allowed) {
      return;
    }

    const elapsedMs = Date.now() - startTime;
    if (elapsedMs > maxWaitMs) {
      throw new Error(
        `Rate limit exceeded for ${connectorName}, max wait time of ${maxWaitMs}ms exceeded`
      );
    }

    // Wait before retrying
    const waitMs = Math.min(
      result.retryAfterSeconds ? result.retryAfterSeconds * 1000 : 1000,
      maxWaitMs - elapsedMs
    );

    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

/**
 * Calculate backoff duration
 */
function calculateBackoffDuration(
  limit: number,
  multiplier: number,
  baseMs: number
): number {
  return Math.round(baseMs * multiplier);
}

/**
 * Reset rate limit quota (admin function)
 */
export async function resetRateLimit(
  tenantId: string,
  connectorName: string,
  quotaType?: QuotaType
): Promise<void> {
  const now = new Date();

  if (quotaType) {
    await prisma.rateLimitQuota.updateMany({
      where: {
        tenantId,
        connectorName: connectorName.toLowerCase(),
        quotaType,
      },
      data: {
        requestCount: 0,
        isBackingOff: false,
        backoffUntil: null,
        backoffMultiplier: 1.0,
        windowStart: now,
        windowEnd: new Date(now.getTime() + 60 * 1000),
      },
    });
  } else {
    await prisma.rateLimitQuota.updateMany({
      where: {
        tenantId,
        connectorName: connectorName.toLowerCase(),
      },
      data: {
        requestCount: 0,
        isBackingOff: false,
        backoffUntil: null,
        backoffMultiplier: 1.0,
        windowStart: now,
        windowEnd: new Date(now.getTime() + 60 * 1000),
      },
    });
  }
}

/**
 * Token bucket rate limiter (alternative algorithm)
 */
export class TokenBucket {
  private tokens: number;
  private lastRefillTime: number;

  constructor(
    private capacity: number,
    private refillRate: number // tokens per second
  ) {
    this.tokens = capacity;
    this.lastRefillTime = Date.now();
  }

  /**
   * Try to consume tokens
   */
  consume(amount: number = 1): boolean {
    this.refill();

    if (this.tokens >= amount) {
      this.tokens -= amount;
      return true;
    }

    return false;
  }

  /**
   * Get time to wait before tokens are available
   */
  getWaitTime(amount: number = 1): number {
    this.refill();

    if (this.tokens >= amount) {
      return 0;
    }

    const needed = amount - this.tokens;
    return Math.ceil((needed / this.refillRate) * 1000);
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now();
    const timePassed = (now - this.lastRefillTime) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + timePassed * this.refillRate);
    this.lastRefillTime = now;
  }

  /**
   * Get current token count
   */
  getCurrentTokens(): number {
    this.refill();
    return Math.floor(this.tokens);
  }
}

/**
 * Sliding window rate limiter
 */
export class SlidingWindow {
  private requests: number[] = [];

  constructor(
    private windowSizeSeconds: number,
    private maxRequests: number
  ) {}

  /**
   * Check if request is allowed
   */
  isAllowed(): boolean {
    const now = Date.now();
    const cutoff = now - this.windowSizeSeconds * 1000;

    // Remove old requests outside the window
    this.requests = this.requests.filter((t) => t > cutoff);

    if (this.requests.length < this.maxRequests) {
      this.requests.push(now);
      return true;
    }

    return false;
  }

  /**
   * Get time until next request is allowed
   */
  getWaitTime(): number {
    if (this.requests.length < this.maxRequests) {
      return 0;
    }

    const oldest = this.requests[0];
    const now = Date.now();
    const windowEnd = oldest + this.windowSizeSeconds * 1000;
    return Math.max(0, windowEnd - now);
  }

  /**
   * Get current request count in window
   */
  getRequestCount(): number {
    const now = Date.now();
    const cutoff = now - this.windowSizeSeconds * 1000;
    return this.requests.filter((t) => t > cutoff).length;
  }
}
