// ---------------------------------------------------------------------------
// Beheer → Boekhouding: wat de beheerder met een bon doet (goedkeuren, afkeuren, uploaden). Dunne laag boven
// keurBonGoed, wijsBonAf en ontvangBon; geeft steeds de bijgewerkte bon terug zodat het scherm de serverversie overneemt.
// De beheerder is ingelogd en dus vertrouwd: een upload heeft herkomst "beheerder".
// ---------------------------------------------------------------------------

import { z } from "zod";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { keurBonGoed, ontvangBon, wijsBonAf, type BonUitkomst } from "./bonnen/bonnen";
import { BON_BTW_PERCENTAGES } from "./bonnen/velden";
import { bonRijOpId } from "./scherm";
import { btwUitTotaal, centenUitInvoer, type BonRij } from "./scherm-kern";

export const goedkeurInvoer = z.object({
  actie: z.literal("goedkeuren"),
  velden: z.object({
    leverancier: z.string().trim().min(2, "Vul de leverancier in.").max(120),
    datum: z.string().trim().min(1, "Vul de datum van de bon in.").max(20),
    totaal: z.string().trim().min(1, "Vul het totaalbedrag in.").max(20),
    btwPercentage: z.number().refine((n) => (BON_BTW_PERCENTAGES as readonly number[]).includes(n), "Kies 0%, 9% of 21% btw."),
    categorie: z.string().trim().min(4, "Kies een categorie.").max(60),
  }),
  betaaldMet: z.enum(["crediteuren", "bank"]).optional(),
  ondanksDubbel: z.boolean().optional(),
});

export const afkeurInvoer = z.object({
  actie: z.literal("afkeuren"),
  reden: z.string().trim().min(3, "Geef een reden voor het afkeuren.").max(500),
});

export const bonActieInvoer = z.discriminatedUnion("actie", [goedkeurInvoer, afkeurInvoer]);
export type BonActie = z.infer<typeof bonActieInvoer>;

export async function keurBonGoedViaScherm(bonId: string, invoer: z.infer<typeof goedkeurInvoer>, door: string): Promise<{ bon: BonRij; boekstuk: string }> {
  const huidig = await prisma.boekBon.findUnique({ where: { id: bonId }, select: { valuta: true, administratie: { select: { valuta: true } } } });
  if (!huidig) throw AppError.notFound("Deze bon bestaat niet.");
  const totaalCents = centenUitInvoer(invoer.velden.totaal);
  if (totaalCents === null || totaalCents <= 0) throw AppError.validation("Het totaalbedrag is geen bedrag. Vul bijvoorbeeld 12,50 in.");
  const { boekstuk } = await keurBonGoed(
    bonId,
    {
      leverancier: invoer.velden.leverancier,
      datum: invoer.velden.datum,
      totaalCents,
      btwPercentage: invoer.velden.btwPercentage,
      btwCents: btwUitTotaal(totaalCents, invoer.velden.btwPercentage),
      valuta: huidig.valuta ?? huidig.administratie.valuta,
      categorie: invoer.velden.categorie,
    },
    { door, betaaldMet: invoer.betaaldMet, ondanksDubbel: invoer.ondanksDubbel },
  );
  return { bon: await bonRijOpId(bonId), boekstuk };
}

export async function wijsBonAfViaScherm(bonId: string, reden: string, door: string): Promise<BonRij> {
  await wijsBonAf(bonId, reden, door);
  return bonRijOpId(bonId);
}

/** Een bon die de beheerder zelf uploadt; de bon wordt uitgelezen en komt meestal bij "even kijken". */
export async function uploadBonViaScherm(opties: {
  administratieId: string;
  bytes: Buffer;
  bestandsnaam: string;
  door: string;
}): Promise<{ uitkomst: BonUitkomst; bon: BonRij }> {
  const uitkomst = await ontvangBon({
    administratieId: opties.administratieId,
    bytes: opties.bytes,
    bestandsnaam: opties.bestandsnaam,
    geuploadDoor: opties.door,
    herkomst: { bron: "upload", beheerder: true },
  });
  return { uitkomst, bon: await bonRijOpId(uitkomst.bonId) };
}
