import type { DomeinBestelling } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { domainContacts, type TransipContact } from "@/lib/mail/hosting/transip";

// ---------------------------------------------------------------------------
// Wie is de houder van een domeinnaam? Het bedrijf van de klant (eigenaar,
// 5 nov: "wat het beste uitkomt"): dat is juridisch zuiver en wekt vertrouwen.
// ZekerFlex blijft beheerder en technisch contact, en houdt het verhuisslot en
// de verhuiscode in handen, dus verhuizen gaat altijd via ZekerFlex
// (lib/domeinen/behoud.ts). Ontbreken er bedrijfsgegevens of weigert het
// register ze, dan wordt ZekerFlex houder (de standaard van het account) en
// staat dat in de notitie; de houder kan later worden aangepast.
// ---------------------------------------------------------------------------

/** KVK-rechtsvorm → de code die TransIP verwacht. Onbekend: "ANDERS". */
export function rechtsvormCode(rechtsvorm: string | null | undefined): string {
  const r = (rechtsvorm ?? "").toLowerCase();
  if (/besloten vennootschap|\bb\.?v\.?\b/.test(r)) return "BV";
  if (/naamloze vennootschap|\bn\.?v\.?\b/.test(r)) return "NV";
  if (/eenmanszaak/.test(r)) return "EENMANSZAAK";
  if (/vennootschap onder firma|\bv\.?o\.?f\.?\b/.test(r)) return "VOF";
  if (/commanditaire vennootschap|\bc\.?v\.?\b/.test(r)) return "CV";
  if (/stichting/.test(r)) return "STICHTING";
  if (/vereniging/.test(r)) return "VERENIGING";
  if (/co[oö]peratie/.test(r)) return "COOP";
  return "ANDERS";
}

/** "Jan van der Berg" → ["Jan", "van der Berg"]. */
export function splitsNaam(volledig: string): { firstName: string; lastName: string } {
  const delen = volledig.trim().split(/\s+/).filter(Boolean);
  if (delen.length === 0) return { firstName: "", lastName: "" };
  if (delen.length === 1) return { firstName: delen[0] ?? "", lastName: delen[0] ?? "" };
  return { firstName: delen[0] ?? "", lastName: delen.slice(1).join(" ") };
}

export interface HouderGegevens {
  bedrijf: string;
  kvk: string | null;
  rechtsvorm: string | null;
  straat: string | null;
  huisnummer: string | null;
  postcode: string | null;
  plaats: string | null;
  land: string | null;
  persoon: string;
  email: string;
}

/**
 * Het houdercontact, of null als er te weinig gegevens zijn (dan is ZekerFlex
 * houder). Telefoon en land in het formaat van ons eigen contact bij TransIP.
 */
export function houderContact(g: HouderGegevens, voorbeeld: Pick<TransipContact, "phoneNumber" | "country">): TransipContact | null {
  const verplicht = [g.bedrijf, g.straat, g.huisnummer, g.postcode, g.plaats, g.persoon, g.email];
  if (verplicht.some((v) => !v || !String(v).trim())) return null;
  const naam = splitsNaam(g.persoon);
  if (!naam.firstName || !naam.lastName) return null;
  const land = (g.land ?? "NL").trim();
  return {
    type: "registrant",
    firstName: naam.firstName,
    lastName: naam.lastName,
    companyName: g.bedrijf.trim(),
    companyKvk: (g.kvk ?? "").trim(),
    companyType: g.kvk ? rechtsvormCode(g.rechtsvorm) : "",
    street: (g.straat ?? "").trim(),
    number: (g.huisnummer ?? "").trim(),
    postalCode: (g.postcode ?? "").replace(/\s+/g, " ").trim().toUpperCase(),
    city: (g.plaats ?? "").trim(),
    phoneNumber: voorbeeld.phoneNumber,
    faxNumber: "",
    email: g.email.trim(),
    country: voorbeeld.country === voorbeeld.country.toLowerCase() ? land.toLowerCase() : land.toUpperCase(),
  };
}

const EIGEN_KEY = "transip-eigen-contacten";

/** Onze eigen contacten (beheerder en technisch) zoals ze bij ons domein staan, een dag bewaard. */
async function eigenContacten(): Promise<TransipContact[]> {
  const bewaard = await kvGet<{ op: number; contacten: TransipContact[] }>(EIGEN_KEY);
  if (bewaard && Date.now() - bewaard.op < 86_400_000 && bewaard.contacten.length > 0) return bewaard.contacten;
  const eigen = new URL(env.APP_BASE_URL).hostname.replace(/^www\./, "");
  const contacten = await domainContacts(eigen);
  if (contacten.length > 0) await kvSet(EIGEN_KEY, { op: Date.now(), contacten });
  return contacten;
}

/**
 * De contacten voor het registreren: de klant als houder, ZekerFlex als
 * beheerder en technisch contact. null = met de standaard van het account
 * registreren (ZekerFlex houder), met de reden.
 */
export async function houderContacten(b: Pick<DomeinBestelling, "tenantId" | "userId" | "email">): Promise<{ contacten: TransipContact[] } | { contacten: null; reden: string }> {
  try {
    const [tenant, gebruiker, eigen] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: b.tenantId }, select: { name: true, companyRegistration: { select: { legalName: true, kvkNumber: true, legalForm: true, street: true, houseNumber: true, postalCode: true, city: true, country: true } } } }),
      prisma.user.findUnique({ where: { id: b.userId }, select: { fullName: true } }),
      eigenContacten(),
    ]);
    const beheer = eigen.find((c) => c.type === "administrative");
    const tech = eigen.find((c) => c.type === "technical") ?? beheer;
    if (!beheer || !tech) return { contacten: null, reden: "eigen contacten bij TransIP niet gevonden" };
    const reg = tenant?.companyRegistration;
    if (!reg) return { contacten: null, reden: "geen KVK-gegevens van het bedrijf" };
    const houder = houderContact(
      { bedrijf: reg.legalName, kvk: reg.kvkNumber, rechtsvorm: reg.legalForm, straat: reg.street, huisnummer: reg.houseNumber, postcode: reg.postalCode, plaats: reg.city, land: reg.country, persoon: gebruiker?.fullName ?? "", email: b.email },
      beheer,
    );
    if (!houder) return { contacten: null, reden: "adres of naam van het bedrijf onvolledig" };
    return { contacten: [houder, { ...beheer, type: "administrative" }, { ...tech, type: "technical" }] };
  } catch (err) {
    logger.warn("domein: houdergegevens niet samen te stellen", { error: (err as Error).message });
    return { contacten: null, reden: "houdergegevens niet op te halen" };
  }
}
