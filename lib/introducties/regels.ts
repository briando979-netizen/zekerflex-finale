// ---------------------------------------------------------------------------
// "Introduceer een bedrijf" (17 nov 2026, eigenaar): een werker of werkgever stelt een bedrijf voor dat ZekerFlex mag
// benaderen. Na het koppelen (Beheer → Sales → Introducties) betaalt dat bedrijf twee weken geen platformkosten
// (lib/introducties/periode.ts). Zodra het de eerste factuur voor platformkosten betaalt, krijgt wie het voorstelde
// € 50 bol-tegoed; dat stuurt de eigenaar met de hand (lib/introducties/beloning.ts, Beheer → Te doen).
// ZekerFlex mailt het voorgestelde bedrijf nooit vanzelf: de lead heeft geen campagne, dus de sales-motor
// (lib/sales/engine.ts) raakt hem niet; een mens belt of mailt.
// Puur: het formulier (browser), de routes en de tests delen dit bestand. Geen zod, prisma of kv.
// ---------------------------------------------------------------------------

/** Het bol-tegoed voor wie een bedrijf voorstelt (in euro's). */
export const BELONING_EURO = 50;
/** Zoveel dagen na het koppelen betaalt het bedrijf geen platformkosten. */
export const GRATIS_DAGEN = 14;
/** Zoveel introducties bewaren we per persoon; de route begrenst daarnaast per dag. */
export const MAX_PER_PERSOON = 100;
/** De bron van de lead (SalesLead.source). */
export const INTRODUCTIE_BRON = "introductie";

export const MAX_NAAM = 120;
export const MAX_BEDRIJF = 160;

export type IntroductieRol = "werker" | "werkgever";

/** "Jan@Bakkerij.NL " → "jan@bakkerij.nl"; null als het geen bruikbaar adres is. */
export function normaliseerEmail(raw: string | null | undefined): string | null {
  const e = (raw ?? "").trim().toLowerCase();
  if (!e || e.length > 254) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/.test(e) ? e : null;
}

/**
 * Een telefoonnummer zoals iemand het intypt, naar +31…: "06 12345678", "6-12345678" (achter het vaste +31),
 * "0031 6 1234 5678" en "+31 (0)6 12345678" worden "+31612345678". Een buitenlands nummer met + of 00 blijft
 * buitenlands. null als het geen nummer is.
 */
export function normaliseerTelefoon(raw: string | null | undefined): string | null {
  let n = (raw ?? "").trim().replace(/[\s()./-]/g, "");
  if (!n || !/^\+?\d+$/.test(n)) return null;
  if (n.startsWith("00")) n = `+${n.slice(2)}`;
  else if (!n.startsWith("+")) n = `+31${n.replace(/^0/, "")}`;
  if (n.startsWith("+31")) {
    n = `+31${n.slice(3).replace(/^0/, "")}`;
    return /^\+31[1-9]\d{8}$/.test(n) ? n : null;
  }
  return /^\+[1-9]\d{7,14}$/.test(n) ? n : null;
}

/** Wat het formulier meestuurt (de route en het scherm gebruiken dezelfde controle). */
export interface IntroductieInvoer {
  contactNaam?: string | undefined;
  bedrijf?: string | undefined;
  email?: string | undefined;
  telefoon?: string | undefined;
  toestemming?: boolean | undefined;
}

export type OntbrekendVeld = "contactNaam" | "bedrijf" | "contact" | "toestemming";
export type OngeldigVeld = "email" | "telefoon";

export interface SchoneIntroductie {
  contactNaam: string;
  bedrijf: string;
  email: string | null;
  telefoon: string | null;
}

export interface IntroductieControle {
  ontbreekt: OntbrekendVeld[];
  ongeldig: OngeldigVeld[];
  /** alleen als niets ontbreekt en alles klopt */
  schoon: SchoneIntroductie | null;
}

const enkel = (s: string | undefined, max: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/**
 * Naam en bedrijf zijn verplicht, plus een e-mailadres óf een telefoonnummer (of allebei), plus het vinkje dat de
 * contactpersoon weet dat ZekerFlex contact opneemt. Wat is ingevuld moet kloppen.
 */
export function controleerIntroductie(i: IntroductieInvoer): IntroductieControle {
  const contactNaam = enkel(i.contactNaam, MAX_NAAM);
  const bedrijf = enkel(i.bedrijf, MAX_BEDRIJF);
  const emailRuw = (i.email ?? "").trim();
  const telRuw = (i.telefoon ?? "").trim();
  const email = emailRuw ? normaliseerEmail(emailRuw) : null;
  const telefoon = telRuw ? normaliseerTelefoon(telRuw) : null;

  const ontbreekt: OntbrekendVeld[] = [];
  if (contactNaam.length < 2) ontbreekt.push("contactNaam");
  if (bedrijf.length < 2) ontbreekt.push("bedrijf");
  if (!emailRuw && !telRuw) ontbreekt.push("contact");
  if (i.toestemming !== true) ontbreekt.push("toestemming");

  const ongeldig: OngeldigVeld[] = [];
  if (emailRuw && !email) ongeldig.push("email");
  if (telRuw && !telefoon) ongeldig.push("telefoon");

  const schoon = ontbreekt.length === 0 && ongeldig.length === 0 ? { contactNaam, bedrijf, email, telefoon } : null;
  return { ontbreekt, ongeldig, schoon };
}

// --- De stand van een introductie, in gewone woorden op het scherm ---------------------------------------------------

export const INTRO_STATUSSEN = ["ingediend", "benaderd", "klant", "beloning-onderweg", "beloning-verstuurd", "al-klant", "eerder", "gestopt"] as const;
export type IntroStatus = (typeof INTRO_STATUSSEN)[number];

/** Een lead die af is zonder klant te worden. */
const GESTOPT = ["LOST", "DISQUALIFIED", "UNSUBSCRIBED", "BOUNCED"];
/** Een lead die benaderd is (mail verstuurd of gereageerd). */
const BENADERD = ["SENT", "REPLIED", "WON"];

export interface StatusFeiten {
  /** het bedrijf werkte al met ZekerFlex toen dit werd voorgesteld */
  alKlant: boolean;
  lead: { status: string; lastContactedAt: string | Date | null; suppressed: boolean } | null;
  /** de lead is aan een bedrijf gekoppeld; introId = de introductie die de beloning krijgt (de eerste) */
  koppeling: { introId: string } | null;
  /** de eerste factuur voor platformkosten van dat bedrijf is betaald */
  beloningVerschuldigd: boolean;
  /** de eigenaar vinkte "bol-tegoed gestuurd" af in Beheer → Te doen */
  beloningVerstuurd: boolean;
}

export function introStatus(introId: string, f: StatusFeiten): IntroStatus {
  if (f.alKlant) return "al-klant";
  if (f.koppeling) {
    if (f.koppeling.introId !== introId) return "eerder";
    if (f.beloningVerschuldigd) return f.beloningVerstuurd ? "beloning-verstuurd" : "beloning-onderweg";
    return "klant";
  }
  if (!f.lead) return "ingediend";
  if (f.lead.suppressed || GESTOPT.includes(f.lead.status)) return "gestopt";
  if (f.lead.lastContactedAt || BENADERD.includes(f.lead.status)) return "benaderd";
  return "ingediend";
}

/**
 * In de Android- en iPhone-app staat de beloning nergens (lib/app-mode.ts: een beloning in geld of tegoed geeft de app
 * een 18+-keuring, en werkers kunnen 16 of 17 zijn). Daar is "beloning onderweg/verstuurd" gewoon "klant geworden".
 */
export function zonderBeloning(s: IntroStatus): IntroStatus {
  return s === "beloning-onderweg" || s === "beloning-verstuurd" ? "klant" : s;
}

/** De introductie die de beloning krijgt: de eerste voor deze lead (vroegste tijd, bij gelijke tijd het kleinste id). */
export function eersteIntroductie<T extends { id: string; at: string }>(lijst: readonly T[]): T | null {
  let eerste: T | null = null;
  for (const i of lijst) {
    if (!eerste || i.at < eerste.at || (i.at === eerste.at && i.id < eerste.id)) eerste = i;
  }
  return eerste;
}

/** De taak in Beheer → Te doen voor het bol-tegoed; het afvinken daarvan is "beloning verstuurd". Hooguit 40 tekens (api/admin/todos). */
export const beloningTodoId = (introId: string): string => `intro-bol:${introId}`;

/** Telt deze betaalde factuur voor de beloning? Alleen platformkosten met een echt bedrag (een € 0-factuur uit de gratis weken niet). */
export function telVoorBeloning(f: { type: string; totalCents: number }): boolean {
  return f.type === "PLATFORM_FEE" && Number.isFinite(f.totalCents) && f.totalCents > 0;
}

/** Eén introductie zoals de werker of werkgever hem in de eigen lijst ziet: het bedrijf en de stand, geen contactgegevens. */
export interface IntroductieRegel {
  id: string;
  at: string;
  bedrijf: string;
  status: IntroStatus;
}

/** Eén introductie in Beheer → Sales → Introducties. */
export interface AdminIntroRegel {
  id: string;
  at: string;
  rol: IntroductieRol;
  bedrijf: string;
  /** naam, adres en nummer van de contactpersoon: uit de lead (niet bewaard bij wie het voorstelde) */
  contactNaam: string | null;
  email: string | null;
  telefoon: string | null;
  door: { userId: string; naam: string; email: string | null };
  leadId: string | null;
  leadStatus: string | null;
  /** er bestond al een lead voor dit adres, domein of nummer */
  bestondAl: boolean;
  /** het bedrijf werkte al met ZekerFlex */
  alKlant: { tenantId: string; naam: string } | null;
  /** de eerste introductie voor deze lead (die krijgt de beloning) */
  eerste: boolean;
  status: IntroStatus;
  koppeling: { tenantId: string; naam: string; gratisVanaf: string; laatsteGratisDag: string; gekoppeldOp: string } | null;
  beloning: { factuurNummer: string; betaaldOp: string; verstuurd: boolean; todoId: string } | null;
}
