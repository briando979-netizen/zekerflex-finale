import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { recordAudit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { MAX_PLAFOND_EURO, beeldenPerDag } from "@/lib/shop/pasdienst-kern";
import { bewaarPasdienst, pasdienstBeschikbaar, pasdienstInfo, verwijderPasdienstSleutel } from "@/lib/shop/pasdienst";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Beheer → Webshop → Hulpmiddelen → Echt passen: de sleutel van de pasdienst (FASHN) en het dagplafond in euro's.
// Alleen platformbeheer. De sleutel komt nooit terug in een antwoord, log of audit (alleen "opgeslagen"/"verwijderd").
const schema = z.object({
  sleutel: z.string().max(300).optional(),
  plafondEuro: z.number().min(0).max(MAX_PLAFOND_EURO).optional(),
});

const stand = async () => {
  const [info, kan] = await Promise.all([pasdienstInfo(), pasdienstBeschikbaar().catch(() => ({ aan: false as const, reden: "uit" as const }))]);
  return { sleutel: { aanwezig: info.aanwezig, ingesteldOp: info.ingesteldOp }, plafondEuro: info.plafondEuro, beeldenPerDag: beeldenPerDag(info.plafondEuro), beschikbaar: kan };
};

export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => NextResponse.json(await stand()));

export const PUT = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) throw AppError.validation(`Vul een sleutel in, of een dagplafond tussen € 0 en € ${MAX_PLAFOND_EURO}.`);
  const sleutel = body.data.sleutel?.trim();
  if (sleutel !== undefined && sleutel !== "" && !/^[A-Za-z0-9_\-.]{16,300}$/.test(sleutel)) throw AppError.validation("Dit lijkt geen sleutel van FASHN. Kopieer hem opnieuw uit het dashboard van FASHN.");
  await bewaarPasdienst({ ...(sleutel ? { sleutel } : {}), ...(body.data.plafondEuro !== undefined ? { plafondEuro: body.data.plafondEuro } : {}) });
  const wat = [sleutel ? "sleutel opgeslagen" : null, body.data.plafondEuro !== undefined ? `dagplafond € ${body.data.plafondEuro}` : null].filter(Boolean).join(", ");
  await recordAudit({ category: "ADMIN", action: "admin.shop.pasdienst", severity: "info", actorUserId: principal.userId, actorLabel: "user", summary: `Pasdienst (FASHN): ${wat || "niets gewijzigd"}` });
  return NextResponse.json(await stand());
});

export const DELETE = withAdminAccess(["PLATFORM_ADMIN"], async (_request, { principal }) => {
  await verwijderPasdienstSleutel();
  await recordAudit({ category: "ADMIN", action: "admin.shop.pasdienst", severity: "info", actorUserId: principal.userId, actorLabel: "user", summary: "Pasdienst (FASHN): sleutel verwijderd" });
  return NextResponse.json(await stand());
});
