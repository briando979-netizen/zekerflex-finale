import { toErrorBody, AppError } from "@/lib/errors";
import { employerTenant } from "@/lib/webhooks/employer";
import { hoursCsv, invoicesCsv } from "@/lib/integrations/employer-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// GET /api/werkgever/export/uren?from=2026-10-01&to=2026-11-01
// GET /api/werkgever/export/facturen?from=…&to=…
// CSV (semicolon, Excel-friendly) for accounting and salary software.
export async function GET(request: Request, props: { params: Promise<{ kind: string }> }): Promise<Response> {
  try {
    const { kind } = await props.params;
    const { tenantId } = await employerTenant(false);
    const url = new URL(request.url);
    const now = new Date();
    const from = url.searchParams.get("from") ? new Date(`${url.searchParams.get("from")}T00:00:00Z`) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const to = url.searchParams.get("to") ? new Date(`${url.searchParams.get("to")}T00:00:00Z`) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) throw AppError.validation("Kies een geldige periode.");
    if (to.getTime() - from.getTime() > 400 * 864e5) throw AppError.validation("Maximaal ruim een jaar per export.");
    let csv: string;
    if (kind === "uren") csv = await hoursCsv(tenantId, from, to);
    else if (kind === "facturen") csv = await invoicesCsv(tenantId, from, to);
    else throw AppError.notFound("Onbekende export");
    const name = `zekerflex-${kind}-${from.toISOString().slice(0, 10)}-${to.toISOString().slice(0, 10)}.csv`;
    return new Response(csv, {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return Response.json(body, { status });
  }
}
