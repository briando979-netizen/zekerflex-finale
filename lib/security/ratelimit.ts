import { prisma } from "@/lib/prisma";

const LIMITS = {
  public: { requests: 100, window: 3600 },
  authenticated: { requests: 1000, window: 3600 },
  admin: { requests: 10000, window: 3600 },
};

export async function checkRateLimit(key: string, role: "public" | "authenticated" | "admin" = "public"): Promise<boolean> {
  const limit = LIMITS[role];
  const now = Date.now();
  const windowStart = now - limit.window * 1000;

  const rateLimitKey = `ratelimit:${key}:${Math.floor(now / (limit.window * 1000))}`;

  try {
    const count = await prisma.rateLimitBucket.upsert({
      where: { key: rateLimitKey },
      update: { count: { increment: 1 } },
      create: { key: rateLimitKey, count: 1, expiresAt: new Date(now + limit.window * 1000) },
    });

    return count.count <= limit.requests;
  } catch {
    return true;
  }
}

export async function getRateLimitInfo(key: string, role: "public" | "authenticated" | "admin" = "public") {
  const limit = LIMITS[role];
  const now = Date.now();

  const rateLimitKey = `ratelimit:${key}:${Math.floor(now / (limit.window * 1000))}`;

  try {
    const bucket = await prisma.rateLimitBucket.findUnique({
      where: { key: rateLimitKey },
    });

    return {
      limit: limit.requests,
      remaining: Math.max(0, limit.requests - (bucket?.count || 0)),
      reset: Math.ceil((bucket?.expiresAt?.getTime() || now) / 1000),
    };
  } catch {
    return {
      limit: limit.requests,
      remaining: limit.requests,
      reset: Math.ceil((now + limit.window * 1000) / 1000),
    };
  }
}

export async function cleanupExpired() {
  await prisma.rateLimitBucket.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
}
