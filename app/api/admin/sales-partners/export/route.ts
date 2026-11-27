import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { isMaand, maandCsv } from "@/lib/sales-partners/model";
import { beheerOverzicht } from "@/lib/sales-partners/overzicht";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/sales-partners/export?partner=<userId>&maand=2026-11: het maandoverzicht van één partner als CSV, zodat
// hij zijn zzp-factuur kan sturen over wat de klant al betaalde. Strikt platformbeheer.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  const zoek = new URL(request.url).searchParams;
  const maand = zoek.get("maand") ?? "";
  const partnerId = zoek.get("partner") ?? "";
  if (!isMaand(maand)) throw AppError.validation("Kies een maand.");
  const { partners, rijen } = await beheerOverzicht();
  const partner = partners.find((p) => p.userId === partnerId);
  if (!partner) throw AppError.notFound("Deze sales partner bestaat niet (meer).");
  const csv = maandCsv(
    { naam: partner.naam, email: partner.email },
    maand,
    rijen.filter((r) => r.partnerId === partnerId),
  );
  const veiligeNaam = partner.naam.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "partner";
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="commissie-${veiligeNaam}-${maand}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
