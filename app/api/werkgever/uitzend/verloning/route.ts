import { requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { bureauContext, verloningVan } from "@/lib/uitzend/bureau";
import { verloningCsv, weekGrenzen } from "@/lib/uitzend/bureau-kern";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/werkgever/uitzend/verloning?week=2026-W47 — de goedgekeurde uren van een week als CSV (puntkomma, Excel), één
// regel per dienst, voor het loonpakket van de uitzendpartner. Alleen voor een uitzendpartner, alleen de eigen locaties.
export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await bureauContext();
    requireRole(ctx.principal, "LOCAL_MANAGER", "HQ_ADMIN", "PLATFORM_ADMIN");
    if (!ctx.tenantId || !ctx.partnerSinds) throw AppError.precondition("Dit kan alleen bij een uitzendpartner.");
    const week = new URL(request.url).searchParams.get("week") ?? "";
    const grenzen = weekGrenzen(week);
    if (!grenzen) throw AppError.validation("Kies een geldige week.");
    const { diensten } = await verloningVan(ctx, grenzen.van, grenzen.tot);
    return new Response(verloningCsv(week, diensten), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="zekerflex-uren-${week}.csv"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return Response.json(body, { status });
  }
}
