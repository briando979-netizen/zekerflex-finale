import { AppError } from "@/lib/errors";
import { withAuth } from "@/lib/auth/handlers";
import { isMaand, maandCsv } from "@/lib/sales-partners/model";
import { partnerOverzicht } from "@/lib/sales-partners/overzicht";
import { isSalesPartner } from "@/lib/sales-partners/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/partner/export?maand=2026-11: het eigen maandoverzicht van een sales partner als CSV (voor zijn zzp-factuur).
export const GET = withAuth(async (request, { principal }) => {
  if (!(await isSalesPartner(principal.userId))) throw AppError.notFound("Het partnerdashboard is alleen voor sales partners.");
  const maand = new URL(request.url).searchParams.get("maand") ?? "";
  if (!isMaand(maand)) throw AppError.validation("Kies een maand.");
  const { rijen } = await partnerOverzicht(principal.userId);
  const csv = maandCsv({ naam: principal.fullName, email: principal.email }, maand, rijen);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="zekerflex-partner-${maand}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
