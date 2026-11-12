import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { BON_MAX_BYTES } from "@/lib/boekhouding/bonnen/bestand";
import { uploadBonViaScherm } from "@/lib/boekhouding/scherm-actie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ID = /^[a-z0-9]{10,40}$/i;

// POST (multipart): administratieId + bestand (pdf, jpg, png of heic, hooguit 15 MB). De ingelogde beheerder geldt als
// vertrouwd; de bon wordt uitgelezen en komt bij twijfel bij "even kijken". Dezelfde bytes twee keer geeft dezelfde bon.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const lengte = Number(request.headers.get("content-length") ?? 0);
  if (lengte > BON_MAX_BYTES + 1024 * 1024) throw AppError.validation("Het bestand is groter dan 15 MB. Maak een kleinere foto of pdf.");
  const form = await request.formData().catch(() => {
    throw AppError.validation("Het verzoek kwam niet goed aan: stuur een formulier met een bestand.");
  });
  const administratieId = String(form.get("administratieId") ?? "").trim();
  if (!ID.test(administratieId)) throw AppError.validation("Kies eerst een administratie.");
  const bestand = form.get("bestand");
  if (!(bestand instanceof File)) throw AppError.validation("Kies een bestand om te uploaden.");
  if (bestand.size > BON_MAX_BYTES) throw AppError.validation("Het bestand is groter dan 15 MB. Maak een kleinere foto of pdf.");
  const bytes = Buffer.from(await bestand.arrayBuffer());

  const { uitkomst, bon } = await uploadBonViaScherm({ administratieId, bytes, bestandsnaam: bestand.name, door: principal.userId });
  await recordAudit({
    category: "ADMIN",
    action: "boekhouding.bon_geupload",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: "Boekhouding: bon geupload",
    targetType: "boekBon",
    targetId: uitkomst.bonId,
    metadata: { status: uitkomst.status, nieuw: uitkomst.nieuw },
  });
  return NextResponse.json({ uitkomst, bon }, { status: uitkomst.nieuw ? 201 : 200 });
});
