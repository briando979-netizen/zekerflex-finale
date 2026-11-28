import { prisma } from "@/lib/prisma";
import { kvDelete, kvGet, kvGetMany, kvSet } from "@/lib/storage/kv";
import { isBelgischeKlus, leesBelgieKlus, LEGE_BELGIE_KLUS, type BelgieKlus, type BelgischContract } from "@/lib/belgie/klus-kern";

// ---------------------------------------------------------------------------
// De keuzes van het bedrijf bij een Belgische klus in de KV (28 nov 2026; lib/belgie/klus-kern.ts legt uit waarom). Geen
// migratie: Shift heeft geen vrij veld, dus alles staat onder een eigen sleutel per klus.
//   • belgie:klus:<shiftId>               de soort contract, horeca, de bevestiging van het bedrijf en de vinkjes. Gegevens
//                                         van het bedrijf over zijn klus, niet over een werker.
//   • belgie-dimona:<shiftId>:<userId>    het Dimona-bevestigingsnummer dat het bedrijf voor één werker invulde (nooit een
//                                         rijksregisternummer). De werker staat achteraan: de sleutel valt onder
//                                         ERASABLE_KV_ACHTERAAN (lib/privacy/user-kv.ts), dus inzage en wissen nemen hem mee.
// ---------------------------------------------------------------------------

const klusSleutel = (shiftId: string) => `belgie:klus:${shiftId}`;
const dimonaSleutel = (shiftId: string, userId: string) => `belgie-dimona:${shiftId}:${userId}`;

export interface DimonaRegel {
  nummer: string;
  op: string;
  /** de gebruiker van het bedrijf die het invulde */
  door: string;
}

/** Wat het bedrijf koos; een storing of een onbekende klus geeft de lege stand (dan vraagt de pagina de keuze opnieuw). */
export async function leesBelgieKlusVoor(shiftId: string): Promise<BelgieKlus> {
  try {
    return leesBelgieKlus(await kvGet<unknown>(klusSleutel(shiftId)));
  } catch {
    return LEGE_BELGIE_KLUS;
  }
}

export async function bewaarBelgieKlus(shiftId: string, klus: BelgieKlus): Promise<void> {
  await kvSet(klusSleutel(shiftId), { ...klus, bijgewerkt: new Date().toISOString() });
}

/** Bij het plaatsen (ook meer dagen tegelijk): dezelfde soort voor elke klus, nog zonder bevestiging. */
export async function zetBelgieKeuzeBijPlaatsen(shiftIds: string[], keuze: { soort: BelgischContract; horeca: boolean }): Promise<void> {
  for (const id of shiftIds) await bewaarBelgieKlus(id, { ...LEGE_BELGIE_KLUS, soort: keuze.soort, horeca: keuze.soort === "flexi" && keuze.horeca });
}

/** Ligt deze klus in België? Een onbekende klus of een storing zegt nee (dan geldt de Nederlandse weg, zoals altijd). */
export async function isBelgischeKlusId(shiftId: string): Promise<boolean> {
  try {
    const klus = await prisma.shift.findUnique({ where: { id: shiftId }, select: { branch: { select: { postalCode: true } } } });
    return isBelgischeKlus(klus?.branch.postalCode);
  } catch {
    return false;
  }
}

/** De Dimona-nummers van deze werkers bij deze klus. */
export async function dimonaNummers(shiftId: string, userIds: string[]): Promise<Map<string, DimonaRegel>> {
  const uit = new Map<string, DimonaRegel>();
  if (userIds.length === 0) return uit;
  const rijen = await kvGetMany<DimonaRegel>(userIds.map((userId) => dimonaSleutel(shiftId, userId))).catch(() => new Map<string, DimonaRegel>());
  for (const userId of userIds) {
    const r = rijen.get(dimonaSleutel(shiftId, userId));
    if (r && typeof r.nummer === "string") uit.set(userId, r);
  }
  return uit;
}

/** Het nummer bewaren (al gecontroleerd met leesDimonaNummer), of wissen met null. */
export async function zetDimonaNummer(shiftId: string, userId: string, nummer: string | null, door: string): Promise<void> {
  if (nummer === null) {
    await kvDelete(dimonaSleutel(shiftId, userId));
    return;
  }
  const regel: DimonaRegel = { nummer, op: new Date().toISOString(), door };
  await kvSet(dimonaSleutel(shiftId, userId), regel);
}
