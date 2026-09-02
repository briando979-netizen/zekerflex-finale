import { env } from "@/lib/env";

// Shared auth gate for internal cron / scheduler endpoints. Accepts the token
// via `x-internal-token`, `Authorization: Bearer`, or `?token=`.

export type InternalGate =
  | { ok: true }
  | { ok: false; status: number; message: string };

export function checkInternalToken(request: Request): InternalGate {
  const authHeader = request.headers.get("authorization");
  const provided =
    request.headers.get("x-internal-token") ??
    (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null) ??
    new URL(request.url).searchParams.get("token");

  if (env.INTERNAL_CRON_TOKEN) {
    return provided === env.INTERNAL_CRON_TOKEN
      ? { ok: true }
      : { ok: false, status: 401, message: "Bad internal token" };
  }
  if (env.NODE_ENV === "production") {
    return {
      ok: false,
      status: 412,
      message: "INTERNAL_CRON_TOKEN is not configured",
    };
  }
  return { ok: true };
}
