import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { heropenTransactie, koppelTransactie, negeerTransactie } from "@/lib/boekhouding/bank/matching";
import { transactieRij } from "@/lib/boekhouding/bank/scherm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID = /^[a-z0-9]{10,40}$/i;
const PRIVE = { "Cache-Control": "private, no-store" };

const koppelInvoer = z.object({
  actie: z.literal("koppel"),
  factuurId: z.string().trim().regex(ID, "Dit is geen geldige factuur.").optional(),
  bonId: z.string().trim().regex(ID, "Dit is geen geldige bon.").optional(),
  rekeningNummer: z.string().trim().regex(/^[0-9]{3,10}$/, "Dit is geen geldig rekeningnummer.").optional(),
});
const negeerInvoer = z.object({ actie: z.literal("negeer"), reden: z.string().trim().min(3, "Geef een reden om deze transactie te negeren.").max(500) });
const heropenInvoer = z.object({ actie: z.literal("heropen") });
const invoer = z.discriminatedUnion("actie", [koppelInvoer, negeerInvoer, heropenInvoer]);

// PATCH { actie: "koppel", factuurId | bonId | rekeningNummer } koppelt (en boekt zo nodig); { actie: "negeer", reden } laat
// de transactie liggen; { actie: "heropen" } zet een genegeerde terug. Geeft de bijgewerkte transactie terug. In het
// auditspoor alleen het id en het soort actie: geen IBAN, naam of bedrag, en niet de reden.
export const PATCH = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (request, { params, principal }) => {
  if (!ID.test(params.id)) throw AppError.validation("Dit is geen geldige banktransactie.");
  const body = invoer.parse(
    await request.json().catch(() => {
      throw AppError.validation("Het verzoek kwam niet goed aan: stuur een JSON-body met actie.");
    }),
  );
  let boekstuk: string | null = null;
  let soort: string = body.actie;
  if (body.actie === "koppel") {
    const gekozen = [body.factuurId, body.bonId, body.rekeningNummer].filter((x) => x !== undefined);
    if (gekozen.length !== 1) throw AppError.validation("Kies precies één ding om aan te koppelen: een factuur, een bon of een kostenrekening.");
    const keuze = body.factuurId ? { factuurId: body.factuurId } : body.bonId ? { bonId: body.bonId } : { rekeningNummer: body.rekeningNummer as string };
    soort = body.factuurId ? "koppel_factuur" : body.bonId ? "koppel_bon" : "koppel_kosten";
    boekstuk = (await koppelTransactie(params.id, keuze, principal.userId)).boekstuk;
  } else if (body.actie === "negeer") {
    await negeerTransactie(params.id, body.reden, principal.userId);
  } else {
    await heropenTransactie(params.id);
  }
  await recordAudit({
    category: "ADMIN",
    action: `boekhouding.banktransactie_${body.actie}`,
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: "Boekhouding: banktransactie bijgewerkt",
    targetType: "boekBankTransactie",
    targetId: params.id,
    metadata: { soort, geboekt: boekstuk !== null },
  });
  return NextResponse.json({ transactie: await transactieRij(params.id), boekstuk }, { headers: PRIVE });
});
