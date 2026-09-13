// Request helpers shared by every route handler.

/**
 * Best-effort caller IP. Trusts `x-forwarded-for` / `x-real-ip` set by the
 * reverse proxy (nginx / Vercel edge). Falls back to `"local"` so a missing
 * header degrades to a single shared bucket rather than throwing.
 */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "local";
}
