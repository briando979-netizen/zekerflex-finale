import { randomBytes } from "crypto";
import type { HorecaZaak } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { zoekCoordinaat } from "@/lib/geo/pdok";
import { schatTussenPunten } from "@/lib/geo/eigen-afstand";
import { logger } from "@/lib/logger";
import { heeftModule } from "@/lib/horeca/modules";
import { plaatsBestelling, zetBestelStatus } from "@/lib/horeca/bestellingen";
import { afrekenen } from "@/lib/horeca/kassa-server";
import type { MandRegel } from "@/lib/horeca/bestellen";
import {
  belbaar,
  bezorgkostenVoor,
  leesBezorgen,
  leverFase,
  leverFout,
  leverSlots,
  MAX_BEZORGERS,
  postcodeNetjes,
  teBetalenCent,
  tijdOpDag,
  vroegsteOp,
  type BezorgInstellingen,
  type LeverSoort,
} from "@/lib/horeca/bezorgen";
import { leesTijden } from "@/lib/horeca/tijden";

// ---------------------------------------------------------------------------
// Afhalen en bezorgen op de server (lib/horeca/bezorgen.ts is het pure deel).
// Het adres van de klant zoeken we op bij PDOK (gratis, van de overheid), de
// afstand schatten we zelf (lib/geo/eigen-afstand.ts): geen betaalde dienst.
// Alles per zaak (updateMany met zaakId), zodat een id van een andere zaak
// nooit iets raakt.
// ---------------------------------------------------------------------------

export interface LeverInvoer {
  soort: LeverSoort;
  mand: MandRegel[];
  opmerking: string;
  naam: string;
  telefoon: string;
  email: string;
  adres: string;
  postcode: string;
  plaats: string;
  /** "zsm" of "UU:MM" (Nederlandse tijd) */
  tijd: string;
}

const punt = (lat: number, lng: number) => ({ latitude: lat, longitude: lng });

/** Waar de zaak ligt; zoekt het adres op en onthoudt het als dat nog niet bekend is. */
async function ligging(zaak: HorecaZaak): Promise<{ lat: number; lng: number } | null> {
  if (typeof zaak.lat === "number" && typeof zaak.lng === "number") return { lat: zaak.lat, lng: zaak.lng };
  const adres = [zaak.adres, zaak.plaats].filter(Boolean).join(", ");
  if (!adres.trim()) return null;
  const plek = await zoekCoordinaat(adres).catch(() => null);
  if (!plek) return null;
  await prisma.horecaZaak.update({ where: { id: zaak.id }, data: { lat: plek.lat, lng: plek.lon } });
  return { lat: plek.lat, lng: plek.lon };
}

/**
 * Een bestelling voor afhalen of bezorgen plaatsen. Door de bediening (telefoon,
 * balie) is de tijd meteen bevestigd; een online bestelling wacht tot de zaak
 * de tijd bevestigt. Prijzen komen van de menukaart (plaatsBestelling).
 */
export async function plaatsLevering(zaak: HorecaZaak, inv: LeverInvoer, bron: "bediening" | "kassa" | "online", nu = new Date()) {
  if (!heeftModule(zaak, "bezorgen")) throw AppError.precondition("Zet eerst de module Afhalen en bezorgen aan.");
  const inst = leesBezorgen(zaak.bezorgen);
  const naam = inv.naam.trim();
  if (naam.length < 2) throw AppError.validation("Vul de naam van de klant in.");
  const telefoon = belbaar(inv.telefoon);
  if (!telefoon) throw AppError.validation("Vul een telefoonnummer in, zodat de zaak kan bellen.");

  let adres = "";
  let postcode = "";
  let plaats = "";
  let lat: number | null = null;
  let lng: number | null = null;
  let afstandM: number | null = null;
  if (inv.soort === "bezorgen") {
    adres = inv.adres.trim();
    plaats = inv.plaats.trim();
    postcode = postcodeNetjes(inv.postcode) ?? "";
    if (adres.length < 3) throw AppError.validation("Vul straat en huisnummer in.");
    if (!postcode) throw AppError.validation("Vul een geldige postcode in, bijvoorbeeld 1056 AB.");
    const plek = await zoekCoordinaat(`${adres}, ${postcode} ${plaats}`).catch((err: unknown) => {
      logger.warn("horeca bezorgen: adres niet opgezocht", { error: (err as Error).message });
      return null;
    });
    if (plek) {
      lat = plek.lat;
      lng = plek.lon;
      if (!plaats && plek.plaats) plaats = plek.plaats;
      const zaakPunt = await ligging(zaak);
      if (zaakPunt) afstandM = schatTussenPunten(punt(zaakPunt.lat, zaakPunt.lng), punt(plek.lat, plek.lon), "DRIVING").distanceMeters;
    }
    // online moet het adres echt bestaan; de bediening mag zelf inschatten (bijvoorbeeld een nieuwbouwwijk)
    if (bron === "online" && !plek) throw AppError.validation("We konden dit adres niet vinden. Controleer straat, huisnummer en postcode.");
    if (!plaats) throw AppError.validation("Vul de plaats in.");
  }

  let gewenstOp: Date | null = null;
  if (inv.tijd !== "zsm") {
    gewenstOp = tijdOpDag(nu, inv.tijd);
    if (!gewenstOp) throw AppError.validation("Kies een tijd als 18:30, of zo snel mogelijk.");
    if (gewenstOp.getTime() < nu.getTime() - 5 * 60_000) throw AppError.validation("Die tijd is al voorbij.");
  }
  const vroegste = vroegsteOp(nu, inv.soort, inst);
  if (bron === "online" && gewenstOp && gewenstOp < vroegste) throw AppError.validation("Zo snel lukt het niet. Kies een latere tijd.");
  const bevestigdOp = bron === "online" ? null : gewenstOp ?? vroegste;

  return plaatsBestelling(zaak, { tafelId: null, mand: inv.mand, opmerking: inv.opmerking, naam, bron }, (totaalCent) => {
    const fout = leverFout(inv.soort, inst, { subtotaalCent: totaalCent, afstandM });
    if (fout) throw AppError.validation(fout);
    return {
      soort: inv.soort,
      telefoon,
      email: inv.email.trim().slice(0, 200),
      adres: adres.slice(0, 120),
      postcode,
      plaats: plaats.slice(0, 60),
      lat,
      lng,
      afstandM,
      gewenstOp,
      bevestigdOp,
      bezorgkostenCent: bezorgkostenVoor(inv.soort, totaalCent, inst),
    };
  });
}

const leverWhere = (zaak: HorecaZaak, id: string) => ({ id, zaakId: zaak.id, soort: { in: ["afhalen", "bezorgen"] }, status: { not: "GEANNULEERD" as const } });

/** De zaak bevestigt (of verzet) de tijd: de tegel krijgt hem, de keuken weet wanneer. */
export async function bevestigTijd(zaak: HorecaZaak, id: string, tijd: string, nu = new Date()) {
  const op = tijdOpDag(nu, tijd);
  if (!op) throw AppError.validation("Kies een tijd als 18:30.");
  const r = await prisma.horecaBestelling.updateMany({ where: { ...leverWhere(zaak, id), afgeleverdOp: null }, data: { bevestigdOp: op } });
  if (!r.count) throw AppError.notFound("Deze bestelling bestaat niet (meer), is geannuleerd of al afgeleverd.");
}

/** Een bezorger aan een bezorgbestelling hangen (of eraf: null). */
export async function wijsBezorgerToe(zaak: HorecaZaak, id: string, bezorgerId: string | null) {
  if (bezorgerId && !leesBezorgen(zaak.bezorgen).bezorgers.some((b) => b.id === bezorgerId && b.actief)) throw AppError.validation("Kies een bezorger uit de lijst.");
  const r = await prisma.horecaBestelling.updateMany({ where: { ...leverWhere(zaak, id), soort: "bezorgen", afgeleverdOp: null }, data: { bezorgerId } });
  if (!r.count) throw AppError.notFound("Deze bezorging bestaat niet (meer) of is al afgeleverd.");
}

/** De bezorger rijdt weg. */
export async function zetOnderweg(zaak: HorecaZaak, id: string, terug = false) {
  const r = await prisma.horecaBestelling.updateMany({ where: { ...leverWhere(zaak, id), soort: "bezorgen", afgeleverdOp: null }, data: { onderwegOp: terug ? null : new Date() } });
  if (!r.count) throw AppError.notFound("Deze bezorging bestaat niet (meer) of is al afgeleverd.");
}

/**
 * Afgeleverd (bezorgen) of opgehaald (afhalen). Betaalt de klant aan de deur of
 * balie met pin of contant, dan rekent de kassa de bestelling meteen af (bon met
 * btw, bezorgkosten erbij); zonder kassamodule onthouden we alleen hoe er betaald is.
 */
export async function zetAfgeleverd(zaak: HorecaZaak, id: string, betaalwijze: "pin" | "contant" | "al-betaald", door: string) {
  const b = await prisma.horecaBestelling.findFirst({ where: leverWhere(zaak, id), select: { id: true, betaald: true, afgeleverdOp: true, betaalwijze: true } });
  if (!b) throw AppError.notFound("Deze bestelling bestaat niet (meer) of is geannuleerd.");
  if (b.afgeleverdOp) return;
  const aanDeDeur = betaalwijze === "pin" || betaalwijze === "contant";
  if (!b.betaald && aanDeDeur && heeftModule(zaak, "kassa")) {
    await afrekenen(zaak, { tafelId: null, bestellingId: id, selectie: null, delen: [{ methode: betaalwijze, bedragCent: 0, fooiCent: 0 }], door });
  }
  // alles wat nog in de keuken stond, is nu ook weg
  await zetBestelStatus(zaak, id, "GESERVEERD");
  await prisma.horecaBestelling.updateMany({
    where: { id, zaakId: zaak.id },
    data: { afgeleverdOp: new Date(), betaald: true, ...(aanDeDeur ? { betaalwijze } : b.betaalwijze ? {} : { betaalwijze: "vooraf" }) },
  });
}

// --- online bestellen door gasten (ronde 4) ---------------------------------

/** Wat een gast vandaag online kan: afhalen en/of bezorgen, met de tijden en de voorwaarden. */
export function leverOpties(zaak: HorecaZaak, nu = new Date()) {
  const inst = leesBezorgen(zaak.bezorgen);
  const tijden = leesTijden(zaak.openingstijden);
  const aan = heeftModule(zaak, "bezorgen");
  const voor = (soort: LeverSoort, staatAan: boolean) => (aan && staatAan ? { aan: true, ...leverSlots(nu, soort, inst, tijden) } : { aan: false, slots: [] as string[], zsm: false });
  return {
    afhalen: voor("afhalen", inst.afhalen),
    bezorgen: voor("bezorgen", inst.bezorgen),
    minimumCent: inst.minimumCent,
    kostenCent: inst.kostenCent,
    gratisVanafCent: inst.gratisVanafCent,
    straalKm: inst.straalKm,
  };
}
export type LeverOpties = ReturnType<typeof leverOpties>;

/** Kan deze tijd online? Geeft een nette fout of null. */
export function onlineTijdFout(opties: LeverOpties, soort: LeverSoort, tijd: string): string | null {
  const o = opties[soort];
  if (!o.aan) return soort === "afhalen" ? "Afhalen kan bij deze zaak niet online." : "Bezorgen kan bij deze zaak niet online.";
  if (!o.slots.length && !o.zsm) return "Vandaag nemen we geen bestellingen meer aan.";
  if (tijd === "zsm") return o.zsm ? null : "Zo snel mogelijk kan nu niet: kies een tijd.";
  return o.slots.includes(tijd) ? null : "Kies een tijd uit de lijst.";
}

/** Wat de gast van zijn eigen bestelling ziet (met de ondertekende link): geen adres, telefoon of e-mail. */
export async function leveringVoorGast(zaakId: string, id: string) {
  const b = await prisma.horecaBestelling.findFirst({
    where: { id, zaakId, soort: { in: ["afhalen", "bezorgen"] } },
    select: { nummer: true, soort: true, status: true, gewenstOp: true, bevestigdOp: true, onderwegOp: true, afgeleverdOp: true, totaalCent: true, kortingCent: true, bezorgkostenCent: true, betaald: true },
  });
  if (!b) return null;
  return {
    nummer: b.nummer,
    soort: b.soort,
    fase: leverFase(b),
    tijd: (b.bevestigdOp ?? b.gewenstOp)?.toISOString() ?? null,
    bevestigd: b.bevestigdOp !== null,
    teBetalenCent: teBetalenCent(b),
    bezorgkostenCent: b.bezorgkostenCent,
    betaald: b.betaald,
  };
}

// --- instellingen en bezorgers ---------------------------------------------

export async function bewaarBezorgInstellingen(zaak: HorecaZaak, inst: Omit<BezorgInstellingen, "bezorgers">) {
  const oud = leesBezorgen(zaak.bezorgen);
  // het adres van de zaak opnieuw opzoeken: de straal rekent vanaf hier
  const plek = await zoekCoordinaat([zaak.adres, zaak.plaats].filter(Boolean).join(", ")).catch(() => null);
  return prisma.horecaZaak.update({
    where: { id: zaak.id },
    data: { bezorgen: { ...inst, bezorgers: oud.bezorgers } as object, ...(plek ? { lat: plek.lat, lng: plek.lon } : {}) },
  });
}

export async function bewaarBezorger(zaak: HorecaZaak, b: { id?: string | undefined; naam: string; telefoon: string; actief: boolean }) {
  const inst = leesBezorgen(zaak.bezorgen);
  let bezorgers = inst.bezorgers;
  if (b.id) {
    if (!bezorgers.some((x) => x.id === b.id)) throw AppError.notFound("Bezorger niet gevonden.");
    bezorgers = bezorgers.map((x) => (x.id === b.id ? { ...x, naam: b.naam, telefoon: b.telefoon, actief: b.actief } : x));
  } else {
    if (bezorgers.length >= MAX_BEZORGERS) throw AppError.validation(`Er passen ${MAX_BEZORGERS} bezorgers in de lijst.`);
    bezorgers = [...bezorgers, { id: randomBytes(6).toString("base64url"), naam: b.naam, telefoon: b.telefoon, actief: b.actief }];
  }
  return prisma.horecaZaak.update({ where: { id: zaak.id }, data: { bezorgen: { ...inst, bezorgers } as object } });
}

export async function verwijderBezorger(zaak: HorecaZaak, id: string) {
  const inst = leesBezorgen(zaak.bezorgen);
  if (!inst.bezorgers.some((x) => x.id === id)) throw AppError.notFound("Bezorger niet gevonden.");
  // open bezorgingen van deze bezorger komen weer vrij
  await prisma.horecaBestelling.updateMany({ where: { zaakId: zaak.id, bezorgerId: id, afgeleverdOp: null }, data: { bezorgerId: null } });
  return prisma.horecaZaak.update({ where: { id: zaak.id }, data: { bezorgen: { ...inst, bezorgers: inst.bezorgers.filter((x) => x.id !== id) } as object } });
}
