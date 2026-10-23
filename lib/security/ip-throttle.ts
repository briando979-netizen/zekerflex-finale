import { fixedWindow } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { AppError } from "@/lib/errors";
import { recordRateLimited } from "@/lib/metrics";

// ---------------------------------------------------------------------------
// Per-IP throttle for sensitive endpoints — the horizontal counterpart to the
// per-account login lockout (lib/auth/login-throttle.ts). Stops credential
// stuffing and mass account creation from one source, which a per-email/
// per-user limit cannot (one attempt each against many identities). A real
// WAF in front is still ideal; this is the in-app safety net.
// ---------------------------------------------------------------------------

export interface IpThrottleSpec {
  name: string;
  limit: number;
  windowSeconds: number;
  message?: string;
}

/** Count one hit for this IP; throw 429 when the window is spent. Fails open on a Redis fault. */
export async function throttleIp(req: Request, spec: IpThrottleSpec): Promise<void> {
  const ip = clientIp(req);
  if (ip === "local") return; // dev / no proxy header — don't throttle
  const gate = await fixedWindow(`rl:ip:${spec.name}:${ip}`, spec.limit, spec.windowSeconds);
  if (!gate.ok) {
    recordRateLimited(`ip:${spec.name}`);
    throw AppError.rateLimited(spec.message ?? "Te veel pogingen vanaf dit adres. Probeer het later opnieuw.", gate.retryAfterSeconds || spec.windowSeconds, spec.limit);
  }
}
