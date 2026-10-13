import { createHash, timingSafeEqual } from "node:crypto";
import { enforceRateLimit, type RateResult } from "@/lib/rate-limit";
import { verifyApiKey, type ApiScope, type VerifiedApiKey } from "@/lib/integrations/api-keys";
import { resolveTenantPlan } from "@/lib/api-plans/resolve";
import { AppError } from "@/lib/errors";

/** Rate limit for a platform-wide key (no tenantId — PLATFORM_ADMIN-issued, not subscription-bound). */
const PLATFORM_KEY_RATE_LIMIT_PER_MINUTE = 120;

export function readApiKey(request: Request): string | null {
  const authorization = request.headers.get("authorization") ?? "";
  if (/^Bearer\s+zf_live_/i.test(authorization)) return authorization.slice(7).trim();
  const header = request.headers.get("x-api-key")?.trim();
  return header?.startsWith("zf_live_") ? header : null;
}

export interface ApiKeyGate {
  key: VerifiedApiKey;
  /** Attach via lib/http/rate-limit-headers.ts's rateLimitHeaders() on every response, not just 429s. */
  rate: RateResult;
}

function secondsUntilMonthEnd(now = new Date()): number {
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return Math.max(1, Math.round((endOfMonth.getTime() - now.getTime()) / 1000));
}

export async function requireApiKey(request: Request, scope: ApiScope): Promise<ApiKeyGate> {
  const raw = readApiKey(request);
  const key = raw ? await verifyApiKey(raw) : null;
  if (!key) throw AppError.unauthenticated("Ongeldige of ontbrekende API-sleutel");
  if (!key.scopes.includes(scope) && !key.scopes.includes("*")) {
    throw AppError.forbidden(`Deze sleutel heeft geen '${scope}'-scope`);
  }

  const plan = key.tenantId ? await resolveTenantPlan(key.tenantId) : null;
  const perMinuteLimit = plan?.rateLimitPerMinute ?? PLATFORM_KEY_RATE_LIMIT_PER_MINUTE;

  const rate = await enforceRateLimit({
    name: "api-key",
    identifier: key.id,
    limit: perMinuteLimit,
    windowSeconds: 60,
    message: "API rate limit bereikt; probeer later opnieuw",
  });

  if (plan?.monthlyRequestCap) {
    const now = new Date();
    const monthKey = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
    await enforceRateLimit({
      name: "api-key-month",
      identifier: `${key.id}:${monthKey}`,
      limit: plan.monthlyRequestCap,
      windowSeconds: secondsUntilMonthEnd(now),
      message: `Maandelijkse API-limiet van je ${plan.label}-abonnement is bereikt; upgrade via /werkgever/integraties.`,
    });
  }

  return { key, rate };
}

export function safeEqualHex(left: string, right: string): boolean {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function hashApiKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
