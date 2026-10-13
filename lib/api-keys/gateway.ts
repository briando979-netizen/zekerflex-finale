import { createHash, timingSafeEqual } from "node:crypto";
import { enforceRateLimit, type RateResult } from "@/lib/rate-limit";
import { verifyApiKey, type ApiScope, type VerifiedApiKey } from "@/lib/integrations/api-keys";
import { AppError } from "@/lib/errors";

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

export async function requireApiKey(request: Request, scope: ApiScope): Promise<ApiKeyGate> {
  const raw = readApiKey(request);
  const key = raw ? await verifyApiKey(raw) : null;
  if (!key) throw AppError.unauthenticated("Ongeldige of ontbrekende API-sleutel");
  if (!key.scopes.includes(scope) && !key.scopes.includes("*")) {
    throw AppError.forbidden(`Deze sleutel heeft geen '${scope}'-scope`);
  }

  const rate = await enforceRateLimit({
    name: "api-key",
    identifier: key.id,
    limit: 120,
    windowSeconds: 60,
    message: "API rate limit bereikt; probeer later opnieuw",
  });
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
