import { AppError } from "@/lib/errors";
import { withAuth } from "@/lib/auth/handlers";
import { getLocale } from "@/lib/i18n/server";
import { isMaand, maandCsv } from "@/lib/sales-partners/model";
import { partnerOverzicht } from "@/lib/sales-partners/overzicht";
import { isSalesPartner } from "@/lib/sales-partners/store";
import { PARTNER_TEKSTEN, partnerTaal } from "@/lib/sales-partners/teksten";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/partner/export?maand=2026-11: het eigen maandoverzicht van een sales partner als CSV (voor zijn zzp-factuur),
// in de taal van het dashboard (Nederlands of Engels).
export const GET = withAuth(async (request, { principal }) => {
  const taal = partnerTaal(await getLocale());
  const tx = PARTNER_TEKSTEN[taal];
  if (!(await isSalesPartner(principal.userId))) throw AppError.notFound(tx.fout.geenPartner);
  const maand = new URL(request.url).searchParams.get("maand") ?? "";
  if (!isMaand(maand)) throw AppError.validation(tx.fout.maand);
  const { rijen } = await partnerOverzicht(principal.userId);
  const csv = maandCsv({ naam: principal.fullName, email: principal.email }, maand, rijen, taal);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="zekerflex-partner-${maand}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
