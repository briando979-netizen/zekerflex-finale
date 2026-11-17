import type { Prisma } from "@prisma/client";
import { amsterdamParts } from "@/lib/time/amsterdam";
import { zakelijkDomein } from "@/lib/sales/vrije-maildomeinen";
import type { IntroductieRol } from "@/lib/introducties/regels";

// ---------------------------------------------------------------------------
// Een introductie naast wat we al kennen (lib/introducties/opslag.ts doet de query's). Puur: alleen de voorwaarden en
// de teksten, zodat de tests ze zonder database nalopen.
//   - al klant: een beheerder van een bedrijf met hetzelfde e-mailadres of hetzelfde zakelijke domein;
//   - al een lead: hetzelfde adres (ook een gevonden adres), hetzelfde zakelijke domein of hetzelfde nummer.
// Een gratis maildienst (gmail, hotmail, …) telt nooit als domein: dan alleen het precieze adres.
// ---------------------------------------------------------------------------

/** Een nieuwe introductielead telt als warm: een gebruiker kent de contactpersoon en die weet dat we bellen (bellijst vanaf 55). */
export const INTRO_SCORE = 80;
export const INTRO_SCORE_REDEN = "Voorgesteld door een gebruiker van ZekerFlex; de contactpersoon weet dat we contact opnemen.";

export interface DubbelVoorwaarden {
  /** OR-lijst voor SalesLead */
  lead: Prisma.SalesLeadWhereInput[];
  /** OR-lijst voor User (een beheerder van een bedrijf) */
  gebruiker: Prisma.UserWhereInput[];
  domein: string | null;
}

export function dubbelVoorwaarden(email: string | null, telefoon: string | null): DubbelVoorwaarden {
  const domein = email ? zakelijkDomein(email) : null;
  const lead: Prisma.SalesLeadWhereInput[] = [];
  const gebruiker: Prisma.UserWhereInput[] = [];
  if (email) {
    lead.push({ contactEmail: { equals: email, mode: "insensitive" } }, { discoveredEmail: { equals: email, mode: "insensitive" } });
    gebruiker.push({ email: { equals: email, mode: "insensitive" } });
  }
  if (domein) {
    lead.push({ contactEmail: { endsWith: `@${domein}`, mode: "insensitive" } }, { discoveredEmail: { endsWith: `@${domein}`, mode: "insensitive" } });
    gebruiker.push({ email: { endsWith: `@${domein}`, mode: "insensitive" } });
  }
  if (telefoon) lead.push({ contactPhone: telefoon });
  return { lead, gebruiker, domein };
}

/** Een beheerder (geen werker) van een echt bedrijf, niet van de platformorganisatie. */
export const BEDRIJFSBEHEERDER: Prisma.MembershipWhereInput = { role: { in: ["HQ_ADMIN", "LOCAL_MANAGER"] }, tenant: { type: { not: "PLATFORM" } } };

const twee = (n: number) => String(n).padStart(2, "0");
const stempel = (nu: Date) => {
  const p = amsterdamParts(nu);
  return `[${twee(p.day)}-${twee(p.month)} ${twee(p.hour)}:${twee(p.minute)}]`;
};

/**
 * De regel bij de notities van de lead. Zonder de naam van wie het voorstelde: de notities gaan ook naar de
 * kennisbank van sales (lib/rag/reindex.ts); wie het was staat in Beheer → Sales → Introducties.
 */
export function introNotitie(rol: IntroductieRol, nu: Date): string {
  return `${stempel(nu)} Introductie via een ${rol === "werkgever" ? "werkgever" : "werker"} (zie Beheer → Sales → Introducties). De contactpersoon weet dat ZekerFlex contact opneemt; niets wordt vanzelf gemaild.`;
}

/** De regel bij het koppelen aan een bedrijf dat zich aanmeldde. */
export function koppelNotitie(bedrijfsnaam: string, laatsteGratisDag: string, nu: Date): string {
  return `${stempel(nu)} Gekoppeld aan bedrijf ${bedrijfsnaam.slice(0, 120)}: geen platformkosten tot en met ${laatsteGratisDag}.`;
}

/**
 * Het contact dat een introductie gaf, bij een lead die al bestond (enrichmentJson.introductieContacten). Alleen voor
 * mensen: de sales-motor schrijft er geen mail mee (lib/sales/outreach.ts haalt het eruit met zonderIntroContacten) en
 * verrijken via de KVK laat het staan (behoudIntroContacten in lib/sales/leads.ts).
 */
export interface IntroContact {
  introId: string;
  at: string;
  contactNaam: string;
  email: string | null;
  telefoon: string | null;
}

const MAX_CONTACTEN = 20;

function contactenVan(enrichment: unknown): IntroContact[] {
  const lijst = enrichment && typeof enrichment === "object" ? (enrichment as { introductieContacten?: unknown }).introductieContacten : undefined;
  return Array.isArray(lijst) ? lijst.filter((c): c is IntroContact => Boolean(c) && typeof (c as IntroContact).introId === "string") : [];
}

/** De verrijking van de lead met het contact van deze introductie erbij (de rest blijft staan; hooguit 20, nieuwste eerst). */
export function metIntroContact(enrichment: unknown, contact: IntroContact): Prisma.InputJsonValue {
  const basis = enrichment && typeof enrichment === "object" && !Array.isArray(enrichment) ? (enrichment as Record<string, unknown>) : {};
  const contacten = [contact, ...contactenVan(enrichment).filter((c) => c.introId !== contact.introId)].slice(0, MAX_CONTACTEN);
  return { ...basis, introductieContacten: contacten } as unknown as Prisma.InputJsonValue;
}

/** Wat de LLM van de sales-motor van de verrijking mag zien: alles behalve de contacten van introducties. */
export function zonderIntroContacten(enrichment: unknown): Record<string, unknown> {
  if (!enrichment || typeof enrichment !== "object" || Array.isArray(enrichment)) return (enrichment ?? {}) as Record<string, unknown>;
  const rest = { ...(enrichment as Record<string, unknown>) };
  delete rest.introductieContacten;
  return rest;
}

/** Bij een verrijking die de oude vervangt (enrichLead): de contacten van introducties blijven staan. */
export function behoudIntroContacten(enrichment: unknown): { introductieContacten?: IntroContact[] } {
  const contacten = contactenVan(enrichment);
  return contacten.length > 0 ? { introductieContacten: contacten } : {};
}

/** Naam, e-mailadres en nummer van één introductie: uit de verrijking, anders de velden van de lead (een lead die de introductie zelf maakte). */
export function introContactVan(
  lead: { contactName: string | null; contactEmail: string | null; contactPhone: string | null; enrichmentJson: unknown } | null,
  introId: string,
): { contactNaam: string | null; email: string | null; telefoon: string | null } {
  if (!lead) return { contactNaam: null, email: null, telefoon: null };
  const c = contactenVan(lead.enrichmentJson).find((x) => x.introId === introId);
  return c ? { contactNaam: c.contactNaam, email: c.email, telefoon: c.telefoon } : { contactNaam: lead.contactName, email: lead.contactEmail, telefoon: lead.contactPhone };
}

/**
 * Een bestaande lead aanvullen: alleen lege velden vullen, nooit iets overschrijven. Nooit bij een lead in een campagne:
 * de motor mailt die velden vanzelf (lib/sales/engine.ts), en een voorgestelde persoon krijgt nooit een automatische mail.
 */
export function aanvullingVoorLead(
  lead: { campaignId: string | null; contactName: string | null; contactEmail: string | null; contactPhone: string | null },
  nieuw: { contactNaam: string; email: string | null; telefoon: string | null },
): { contactName?: string; contactEmail?: string; contactPhone?: string } {
  return lead.campaignId ? {} : aanvulling(lead, nieuw);
}

/** Een bestaande lead aanvullen: alleen lege velden vullen, nooit iets overschrijven. */
export function aanvulling(
  lead: { contactName: string | null; contactEmail: string | null; contactPhone: string | null },
  nieuw: { contactNaam: string; email: string | null; telefoon: string | null },
): { contactName?: string; contactEmail?: string; contactPhone?: string } {
  return {
    ...(!lead.contactName?.trim() ? { contactName: nieuw.contactNaam } : {}),
    ...(!lead.contactEmail?.trim() && nieuw.email ? { contactEmail: nieuw.email } : {}),
    ...(!lead.contactPhone?.trim() && nieuw.telefoon ? { contactPhone: nieuw.telefoon } : {}),
  };
}
