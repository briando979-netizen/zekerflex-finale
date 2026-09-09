import { checkInternalToken } from "@/lib/internal-auth";
import { renderMetrics, metricsContentType } from "@/lib/metrics";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/metrics — Prometheus exposition. Same shared-secret auth as the
// cron endpoints (CRON_SECRET / INTERNAL_CRON_TOKEN); open in local dev when
// no token is configured. Scrape it from the internal observability network
// only (see infra/docker/prometheus.yml).
async function handle(request: Request): Promise<Response> {
  const gate = checkInternalToken(request);
  if (!gate.ok) {
    return new Response(gate.message, { status: gate.status });
  }
  try {
    return new Response(await renderMetrics(), {
      status: 200,
      headers: { "content-type": metricsContentType(), "cache-control": "no-store" },
    });
  } catch (err) {
    logger.error("metrics render failed", { error: (err as Error).message });
    return new Response("metrics unavailable", { status: 500 });
  }
}

export const GET = handle;
