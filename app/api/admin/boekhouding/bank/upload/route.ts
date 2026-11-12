import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { importeerAfschrift } from "@/lib/boekhouding/bank/import";
import { BANK_MAX_BYTES } from "@/lib/boekhouding/bank/types";
import { bankOverzicht } from "@/lib/boekhouding/bank/scherm";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ID = /^[a-z0-9]{10,40}$/i;
const PRIVE = { "Cache-Control": "private, no-store" };

// POST (multipart): bankRekeningId + bestand (CAMT.053-xml of csv van ING, Rabobank of ABN AMRO, hooguit 5 MB). Dezelfde
// bytes twee keer geeft hetzelfde afschrift; overlappende periodes geven nooit dubbele transacties. In het auditspoor
// alleen id's en aantallen: geen IBAN, naam of bedrag.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const lengte = Number(request.headers.get("content-length") ?? 0);
  if (lengte > BANK_MAX_BYTES + 1024 * 1024) throw AppError.validation("Het bestand is groter dan 5 MB. Exporteer een kortere periode.");
  const form = await request.formData().catch(() => {
    throw AppError.validation("Het verzoek kwam niet goed aan: stuur een formulier met een bestand.");
  });
  const bankRekeningId = String(form.get("bankRekeningId") ?? "").trim();
  if (!ID.test(bankRekeningId)) throw AppError.validation("Kies eerst een bankrekening.");
  const bestand = form.get("bestand");
  if (!(bestand instanceof File)) throw AppError.validation("Kies een bestand om in te lezen.");
  if (bestand.size > BANK_MAX_BYTES) throw AppError.validation("Het bestand is groter dan 5 MB. Exporteer een kortere periode.");
  const bytes = Buffer.from(await bestand.arrayBuffer());

  const uitkomst = await importeerAfschrift({ bankRekeningId, bytes, door: principal.userId });
  await recordAudit({
    category: "ADMIN",
    action: "boekhouding.bankafschrift_ingelezen",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: "Boekhouding: bankafschrift ingelezen",
    targetType: "boekBankAfschrift",
    targetId: uitkomst.afschriftId,
    metadata: {
      formaat: uitkomst.formaat,
      alIngelezen: uitkomst.alIngelezen,
      totaal: uitkomst.totaal,
      nieuw: uitkomst.nieuw,
      ...(uitkomst.verwerkt ? { geboekt: uitkomst.verwerkt.geboekt, gekoppeld: uitkomst.verwerkt.gekoppeld, evenKijken: uitkomst.verwerkt.evenKijken } : {}),
    },
  });
  const rekening = await prisma.boekBankRekening.findUnique({ where: { id: bankRekeningId }, select: { administratieId: true } });
  const overzicht = rekening ? await bankOverzicht(rekening.administratieId) : null;
  return NextResponse.json({ uitkomst, overzicht }, { status: uitkomst.alIngelezen ? 200 : 201, headers: PRIVE });
});
