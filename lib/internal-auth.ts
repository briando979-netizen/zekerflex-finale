import { env } from "@/lib/env";

// Shared auth gate for internal cron / scheduler endpoints. Accepts the token
// via `x-internal-token`, `Authorization: Bearer`, or `?token=`.
//
// Checked against CRON_SECRET first: that's the env var name Vercel Cron
// recognizes on its own — when it's set, Vercel automatically sends
// `Authorization: Bearer $CRON_SECRET` on every scheduled invocation, no
// extra wiring needed. INTERNAL_CRON_TOKEN is accepted too, for a
// non-Vercel scheduler or manual/local triggering with a different secret.
// (A real prior bug: this only checked INTERNAL_CRON_TOKEN, which Vercel has
// no knowledge of, so vercel.json's scheduled crons were 401ing silently
// every run — CRON_SECRET is now provisioned to the same value.)

export type InternalGate =
  | { ok: true }
  | { ok: false; status: number; message: string };

export function checkInternalToken(request: Request): InternalGate {
  const authHeader = request.headers.get("authorization");
  const provided =
    request.headers.get("x-internal-token") ??
    (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null) ??
    new URL(request.url).searchParams.get("token");

  const accepted = [env.CRON_SECRET, env.INTERNAL_CRON_TOKEN].filter(
    (s): s is string => Boolean(s),
  );
  if (accepted.length > 0) {
    return provided && accepted.includes(provided)
      ? { ok: true }
      : { ok: false, status: 401, message: "Bad internal token" };
  }
  if (env.NODE_ENV === "production") {
    return {
      ok: false,
      status: 412,
      message: "CRON_SECRET / INTERNAL_CRON_TOKEN is not configured",
    };
  }
  return { ok: true };
}
