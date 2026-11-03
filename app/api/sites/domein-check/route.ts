import { mayIssueCertificate } from "@/lib/sites/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/sites/domein-check?domain=<host> — Caddy's on-demand TLS "ask"
// (deploy/caddy/Caddyfile): 200 only for a proven own domain of a published
// website, so nobody can make our server fetch certificates for other names.
export async function GET(request: Request): Promise<Response> {
  const domain = new URL(request.url).searchParams.get("domain") ?? "";
  const ok = await mayIssueCertificate(domain);
  return new Response(ok ? "ok" : "onbekend domein", { status: ok ? 200 : 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
