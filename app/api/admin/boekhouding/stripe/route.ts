import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { bytesNaarTekst } from "@/lib/boekhouding/bank/tekst";
import { importeerStripeRapport } from "@/lib/boekhouding/stripe/import";
import { STRIPE_RAPPORT_MAX_BYTES } from "@/lib/boekhouding/stripe/rapport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ID = /^[a-z0-9]{10,40}$/i;
const PRIVE = { "Cache-Control": "private, no-store" };

// POST (multipart): administratieId + bestand (csv "Payout reconciliation" uit het Stripe Dashboard, hooguit 5 MB).
// Geen Stripe-aanroep: alleen het bestand wordt gelezen. Dezelfde payout twee keer geeft niets dubbels. In het
// auditspoor alleen aantallen: geen bedragen, geen omschrijvingen.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const lengte = Number(request.headers.get("content-length") ?? 0);
  if (lengte > STRIPE_RAPPORT_MAX_BYTES + 1024 * 1024) throw AppError.validation("Het bestand is groter dan 5 MB. Exporteer een kortere periode.");
  const form = await request.formData().catch(() => {
    throw AppError.validation("Het verzoek kwam niet goed aan: stuur een formulier met een bestand.");
  });
  const administratieId = String(form.get("administratieId") ?? "").trim();
  if (!ID.test(administratieId)) throw AppError.validation("Kies eerst een administratie.");
  const bestand = form.get("bestand");
  if (!(bestand instanceof File)) throw AppError.validation("Kies een bestand om in te lezen.");
  if (bestand.size > STRIPE_RAPPORT_MAX_BYTES) throw AppError.validation("Het bestand is groter dan 5 MB. Exporteer een kortere periode.");
  const csv = bytesNaarTekst(new Uint8Array(await bestand.arrayBuffer()));

  const uitkomst = await importeerStripeRapport(administratieId, csv, principal.userId);
  await recordAudit({
    category: "ADMIN",
    action: "boekhouding.stripe_uitbetalingen_ingelezen",
    actorUserId: principal.userId,
    actorLabel: "user",
    severity: uitkomst.fouten.length > 0 ? "warning" : "info",
    summary: `Boekhouding: Stripe-uitbetalingen ingelezen, ${uitkomst.nieuw} nieuw, ${uitkomst.fouten.length} fouten`,
    targetType: "boekAdministratie",
    targetId: administratieId,
    metadata: { totaal: uitkomst.totaal, nieuw: uitkomst.nieuw, alBekend: uitkomst.alBekend, fouten: uitkomst.fouten.length },
  });
  return NextResponse.json({ uitkomst }, { status: 200, headers: PRIVE });
});
