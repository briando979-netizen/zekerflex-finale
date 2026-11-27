import { randomUUID } from "node:crypto";
import { kvGet, kvGetMany, kvSet } from "@/lib/storage/kv";
import { recordAudit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { MAX_BEDRIJVEN, isAlGeregistreerd, leesBedrijven, leesPartnerSet, type PartnerBedrijf, type PartnerModel } from "@/lib/sales-partners/model";

// ---------------------------------------------------------------------------
// Sales partners in KV (geen migratie, zelfde opzet als lib/uitzend/partners.ts):
//   systeem:salespartners        { userId: sinds }  wie sales partner is (een lijst van het beheer)
//   salespartner:<userId>        { bedrijven: PartnerBedrijf[] }  wat hij registreerde (in ERASABLE_KV_PREFIXES:
//                                bij het wissen van zijn account gaan zijn registraties mee)
// Wie partner is, lezen de schermen vaak (de knop in de werkers-app en het werkgeversmenu): 60 s in het geheugen via
// globalThis (Next bundelt routes apart). Een storing zegt "geen partner"; dan verdwijnt alleen de knop even.
// ---------------------------------------------------------------------------

export const PARTNERS_SLEUTEL = "systeem:salespartners";
export const bedrijvenSleutel = (userId: string): string => `salespartner:${userId}`;

const CACHE_MS = 60_000;
const geheugen = globalThis as unknown as { __zfSalesPartners?: { at: number; set: Record<string, string> } | undefined };

export async function leesSalesPartners(nu: number = Date.now()): Promise<Record<string, string>> {
  const c = geheugen.__zfSalesPartners;
  if (c && nu - c.at >= 0 && nu - c.at < CACHE_MS) return c.set;
  try {
    const set = leesPartnerSet(await kvGet<unknown>(PARTNERS_SLEUTEL));
    geheugen.__zfSalesPartners = { at: nu, set };
    return set;
  } catch {
    return {};
  }
}

/** Zonder cache, voor het beheer (dat moet een net toegevoegde partner meteen zien). */
export async function leesSalesPartnersVers(): Promise<Record<string, string>> {
  return leesPartnerSet(await kvGet<unknown>(PARTNERS_SLEUTEL));
}

export async function isSalesPartner(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  return Object.hasOwn(await leesSalesPartners(), userId);
}

/** Iemand sales partner maken of dat weghalen (alleen het beheer), met een regel in de audit. Zijn registraties blijven staan. */
export async function zetSalesPartner(userId: string, aan: boolean, door: { userId: string }, nu: Date = new Date()): Promise<Record<string, string>> {
  const set = leesPartnerSet(await kvGet<unknown>(PARTNERS_SLEUTEL));
  if (aan) set[userId] ??= nu.toISOString();
  else delete set[userId];
  await kvSet(PARTNERS_SLEUTEL, set);
  geheugen.__zfSalesPartners = undefined;
  await recordAudit({
    category: "ADMIN",
    action: aan ? "salespartner.aan" : "salespartner.uit",
    actorUserId: door.userId,
    actorLabel: "user",
    summary: aan ? "Gebruiker is sales partner geworden (partnerdashboard aan)" : "Gebruiker is geen sales partner meer",
    targetType: "user",
    targetId: userId,
  });
  return set;
}

export async function bedrijvenVan(userId: string): Promise<PartnerBedrijf[]> {
  return leesBedrijven(await kvGet<unknown>(bedrijvenSleutel(userId)));
}

/** Alle registraties van alle partners (voor het beheer en de controle op dubbele registraties). */
export async function alleBedrijven(): Promise<{ partnerId: string; bedrijf: PartnerBedrijf }[]> {
  const ids = Object.keys(leesPartnerSet(await kvGet<unknown>(PARTNERS_SLEUTEL)));
  if (!ids.length) return [];
  const waarden = await kvGetMany<unknown>(ids.map(bedrijvenSleutel));
  return ids.flatMap((partnerId) => leesBedrijven(waarden.get(bedrijvenSleutel(partnerId))).map((bedrijf) => ({ partnerId, bedrijf })));
}

export interface NieuwBedrijf {
  bedrijfsnaam: string;
  kvk: string | null;
  contactnaam: string;
  email: string;
  telefoon: string;
  model: PartnerModel;
}

/** Een partner registreert een bedrijf. Een bedrijf dat al door een partner is geregistreerd, kan niet nog een keer. */
export async function registreerBedrijf(userId: string, invoer: NieuwBedrijf, nu: Date = new Date()): Promise<PartnerBedrijf[]> {
  const eigen = await bedrijvenVan(userId);
  if (eigen.length >= MAX_BEDRIJVEN) throw AppError.validation(`Je kunt maximaal ${MAX_BEDRIJVEN} bedrijven registreren. Neem contact op met ZekerFlex.`);
  const alle = (await alleBedrijven()).map((r) => r.bedrijf);
  if (isAlGeregistreerd([...alle, ...eigen], invoer)) {
    throw AppError.conflict("Dit bedrijf is al geregistreerd door een sales partner (zelfde KvK-nummer of e-mailadres).");
  }
  const nieuw: PartnerBedrijf = {
    id: randomUUID(),
    ...invoer,
    email: invoer.email.trim().toLowerCase(),
    aangemaaktOp: nu.toISOString(),
    tenantId: null,
    tenantNaam: null,
    gekoppeldOp: null,
    afgewezenOp: null,
    afwijsReden: null,
  };
  const lijst = [nieuw, ...eigen];
  await kvSet(bedrijvenSleutel(userId), { bedrijven: lijst });
  return lijst;
}

export type BeheerActie =
  | { soort: "koppel"; tenantId: string; tenantNaam: string }
  | { soort: "ontkoppel" }
  | { soort: "afwijzen"; reden: string }
  | { soort: "herstel" };

/** Het beheer keurt een registratie goed (koppelen aan een bedrijfsaccount), wijst hem af of zet hem terug. */
export async function beheerBedrijf(partnerId: string, bedrijfId: string, actie: BeheerActie, door: { userId: string }, nu: Date = new Date()): Promise<PartnerBedrijf> {
  const lijst = await bedrijvenVan(partnerId);
  const b = lijst.find((x) => x.id === bedrijfId);
  if (!b) throw AppError.notFound("Deze registratie bestaat niet (meer).");
  if (actie.soort === "koppel") {
    const dubbel = (await alleBedrijven()).find((r) => r.bedrijf.id !== bedrijfId && r.bedrijf.tenantId === actie.tenantId && !r.bedrijf.afgewezenOp);
    if (dubbel) throw AppError.conflict("Dit bedrijfsaccount is al gekoppeld aan een andere registratie. Ontkoppel die eerst.");
    Object.assign(b, { tenantId: actie.tenantId, tenantNaam: actie.tenantNaam, gekoppeldOp: nu.toISOString(), afgewezenOp: null, afwijsReden: null });
  } else if (actie.soort === "ontkoppel") {
    Object.assign(b, { tenantId: null, tenantNaam: null, gekoppeldOp: null });
  } else if (actie.soort === "afwijzen") {
    Object.assign(b, { tenantId: null, tenantNaam: null, gekoppeldOp: null, afgewezenOp: nu.toISOString(), afwijsReden: actie.reden || null });
  } else {
    Object.assign(b, { afgewezenOp: null, afwijsReden: null });
  }
  await kvSet(bedrijvenSleutel(partnerId), { bedrijven: lijst });
  await recordAudit({
    category: "ADMIN",
    action: `salespartner.bedrijf.${actie.soort}`,
    actorUserId: door.userId,
    actorLabel: "user",
    summary:
      actie.soort === "koppel"
        ? `Registratie "${b.bedrijfsnaam}" gekoppeld aan bedrijfsaccount ${actie.tenantNaam}`
        : actie.soort === "afwijzen"
          ? `Registratie "${b.bedrijfsnaam}" afgewezen`
          : actie.soort === "ontkoppel"
            ? `Registratie "${b.bedrijfsnaam}" ontkoppeld`
            : `Registratie "${b.bedrijfsnaam}" teruggezet`,
    targetType: "user",
    targetId: partnerId,
  });
  return b;
}
