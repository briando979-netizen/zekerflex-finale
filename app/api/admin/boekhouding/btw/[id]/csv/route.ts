import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { btwConceptOpId } from "@/lib/boekhouding/btw/concept";
import { conceptNaarCsv } from "@/lib/boekhouding/btw/kern";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID = /^[a-z0-9]{10,40}$/i;

// GET: het concept als CSV (rubriek, grondslag, btw) om te bewaren of aan een accountant te geven. Geen persoonsgegevens.
export const GET = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (_request, { params }) => {
  if (!ID.test(params.id)) throw AppError.validation("Dit is geen geldig btw-concept.");
  const concept = await btwConceptOpId(params.id);
  return new Response(conceptNaarCsv(concept.inhoud.rubrieken), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="btw-concept-${concept.jaar}-k${concept.kwartaal}-v${concept.versie}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
