import { isTestklus } from "@/lib/shifts/testklus";

// ---------------------------------------------------------------------------
// Admin → Onboarding: de pure regels. Welke accounts tellen mee, welke stappen
// een werker of werkgever doorloopt, op welke stap iemand vastzit, de trechter
// en de CSV. Geen database hier: lib/admin/insights/onboarding.ts haalt de
// feiten op, dit bestand rekent ze alleen uit (en is dus te testen).
//
// De stappen volgen de definities van de server: profiel af = rekeningnummer
// én thuispostcode (lib/dashboard/freelancer.ts), bedrijf = KVK gekoppeld en
// vestiging = minstens één (lib/onboarding/employer.ts), bedrijf geverifieerd =
// lib/company/verified.ts, identiteit = User.kycStatus VERIFIED.
// ---------------------------------------------------------------------------

export type Doelgroep = "werker" | "werkgever";

export interface StapDef {
  key: string;
  label: string;
  /** Korte uitleg voor de tabel: wat moet er nog gebeuren. */
  open: string;
}

export const WERKER_STAPPEN: readonly StapDef[] = [
  { key: "aangemeld", label: "Aangemeld", open: "Aangemeld" },
  { key: "email", label: "E-mail bevestigd", open: "E-mail nog niet bevestigd" },
  { key: "soort", label: "Soort gekozen", open: "Nog geen soort gekozen (zzp, flex, uitzend)" },
  { key: "profiel", label: "Profiel (postcode en IBAN)", open: "Postcode of IBAN ontbreekt" },
  { key: "identiteit", label: "Identiteit geverifieerd", open: "Identiteit niet geverifieerd" },
  { key: "reactie", label: "Eerste reactie op een klus", open: "Nog niet op een klus gereageerd" },
];

export const WERKGEVER_STAPPEN: readonly StapDef[] = [
  { key: "aangemeld", label: "Aangemeld", open: "Aangemeld" },
  { key: "email", label: "E-mail bevestigd", open: "E-mail nog niet bevestigd" },
  { key: "bedrijf", label: "Bedrijf (KVK)", open: "KVK-nummer nog niet gekoppeld" },
  { key: "vestiging", label: "Vestiging", open: "Nog geen vestiging" },
  { key: "geverifieerd", label: "Bedrijf geverifieerd", open: "Bedrijf wacht op verificatie" },
  { key: "klus", label: "Eerste klus", open: "Nog geen klus geplaatst" },
];

export function stappenVan(doelgroep: Doelgroep): readonly StapDef[] {
  return doelgroep === "werker" ? WERKER_STAPPEN : WERKGEVER_STAPPEN;
}

/** Het account op het moment van berekenen, met per stap of die gehaald is (zelfde volgorde als de stappenlijst). */
export interface OnboardingRij {
  id: string;
  naam: string;
  /** alleen om op te zoeken, nooit in de CSV */
  email: string;
  doelgroep: Doelgroep;
  rollen: string[];
  aangemeld: Date;
  laatsteInlog: Date | null;
  /** gehaald per stap, in de volgorde van stappenVan(doelgroep) */
  gehaald: boolean[];
  herinneringen: number;
  tenantId: string | null;
  tenantNaam: string | null;
}

// --- Welke accounts tellen mee ----------------------------------------------

const RESERVED_ADDRESS = /@(?:[^@\s]+\.)?[^@\s.]+\.(test|example|invalid|localhost)$/i;

export interface TestKenmerken {
  email: string;
  rollen: string[];
  disabledAt: Date | null;
  tenantNamen: string[];
}

/**
 * Is dit een testaccount of iets wat niet bij de echte aanmeldingen hoort? Zelfde afbakening als de
 * gebruikersanalyse: testadressen (.test/.example/.invalid/localhost, zie isReservedTestAddress in
 * lib/mail, plus example.com/net/org), eigen adressen (@zekerflex.com/.nl), verwijderde en geblokkeerde
 * accounts, beheerders en sales, en bedrijven die "Test …" heten (isTestklus in lib/shifts/testklus.ts).
 */
export function isTestAccount(k: TestKenmerken): boolean {
  const email = k.email.trim().toLowerCase();
  if (RESERVED_ADDRESS.test(email) || /@localhost$/.test(email)) return true;
  if (/@(?:[^@\s]+\.)?example\.(com|net|org)$/.test(email)) return true;
  if (/@zekerflex\.(com|nl)$/.test(email)) return true;
  if (k.disabledAt) return true;
  if (k.rollen.some((r) => r === "PLATFORM_ADMIN" || r === "SALES")) return true;
  return k.tenantNamen.some((naam) => isTestklus({ title: "", bedrijf: naam }));
}

// --- Stap bepalen ------------------------------------------------------------

/** Index van de eerste stap die nog niet gehaald is, of -1 als alles klaar is. */
export function eersteOpenStap(gehaald: boolean[]): number {
  return gehaald.findIndex((g) => !g);
}

/** Hoever iemand echt is: aantal stappen vanaf het begin dat achter elkaar gehaald is. */
export function bereikteStappen(gehaald: boolean[]): number {
  const open = eersteOpenStap(gehaald);
  return open === -1 ? gehaald.length : open;
}

/** Eén dag respijt: wie net is aangemeld zit nog niet vast. */
export const RESPIJT_MS = 24 * 60 * 60 * 1000;

export interface VastStatus {
  /** index in de stappenlijst, -1 = alles klaar */
  stap: number;
  stapKey: string | null;
  label: string;
  /** vastgelopen = een stap vóór de laatste (activatie) staat open en de respijt is voorbij */
  vast: boolean;
}

export function vastStatus(rij: Pick<OnboardingRij, "doelgroep" | "gehaald" | "aangemeld">, now: Date): VastStatus {
  const stappen = stappenVan(rij.doelgroep);
  const stap = eersteOpenStap(rij.gehaald);
  if (stap === -1) return { stap, stapKey: null, label: "Alles klaar", vast: false };
  const def = stappen[stap];
  const laatste = stappen.length - 1;
  const oud = now.getTime() - rij.aangemeld.getTime() >= RESPIJT_MS;
  return { stap, stapKey: def?.key ?? null, label: def?.open ?? "Onbekend", vast: stap < laatste && oud };
}

// --- Trechter ------------------------------------------------------------------

export interface TrechterStap {
  key: string;
  label: string;
  aantal: number;
  /** percentage van de vorige stap (null bij de eerste) */
  vanVorige: number | null;
  /** percentage van wie begon */
  vanBegin: number;
  /** hoeveel er op deze stap uitvielen ten opzichte van de vorige */
  uitval: number;
}

const pct = (deel: number, geheel: number) => (geheel > 0 ? Math.round((deel / geheel) * 100) : 0);

/** Aantal accounts dat stap n én alle stappen ervoor haalde, met doorstroom en uitval. */
export function trechter(doelgroep: Doelgroep, rijen: Pick<OnboardingRij, "gehaald">[]): TrechterStap[] {
  const stappen = stappenVan(doelgroep);
  const reach = rijen.map((r) => bereikteStappen(r.gehaald));
  const begin = rijen.length;
  return stappen.map((def, i) => {
    const aantal = reach.filter((n) => n > i).length;
    const vorige = i === 0 ? null : reach.filter((n) => n > i - 1).length;
    return {
      key: def.key,
      label: def.label,
      aantal,
      vanVorige: vorige === null ? null : pct(aantal, vorige),
      vanBegin: pct(aantal, begin),
      uitval: vorige === null ? 0 : vorige - aantal,
    };
  });
}

// --- Leeftijd ---------------------------------------------------------------------

export type Leeftijd = "dag" | "week" | "maand" | "ouder";

export function leeftijdVan(aangemeld: Date, now: Date): Leeftijd {
  const dagen = (now.getTime() - aangemeld.getTime()) / 86_400_000;
  if (dagen < 1) return "dag";
  if (dagen < 7) return "week";
  if (dagen < 30) return "maand";
  return "ouder";
}

export const LEEFTIJD_LABEL: Record<Leeftijd, string> = {
  dag: "Minder dan een dag",
  week: "1 tot 7 dagen",
  maand: "1 week tot 30 dagen",
  ouder: "Ouder dan 30 dagen",
};

// --- CSV ---------------------------------------------------------------------------

/** De CSV-regel van een rij (sleutels = kolommen van de tabel): bewust zonder e-mailadres, telefoon, IBAN, BSN of documentnummers (AVG). */
export function csvRegel(rij: OnboardingRij, now: Date): Record<string, string> {
  const status = vastStatus(rij, now);
  return {
    account: rij.id,
    naam: rij.naam,
    soort: rij.doelgroep === "werker" ? "Werker" : "Werkgever",
    rol: rij.rollen.join(" + "),
    aangemeld: rij.aangemeld.toISOString(),
    laatste: rij.laatsteInlog?.toISOString() ?? "",
    stap: status.label,
    vastgelopen: status.vast ? "ja" : "nee",
    herinneringen: String(rij.herinneringen),
  };
}

// --- Tijdlijn van één account --------------------------------------------------------

export interface TijdlijnInvoer {
  aangemeld: Date;
  emailBevestigdOp: Date | null;
  laatsteInlog: Date | null;
  /** FreelancerProfile.createdAt (werkers) */
  profielAangemaakt: Date | null;
  /** gekozen werkvorm uit de fiscale gegevens, of null */
  soort: string | null;
  identiteit: { at: Date; label: string; goed: boolean | null }[];
  herinneringen: { aantal: number; laatsteOp: Date | null };
  /** gebeurtenissen uit het auditspoor die bij het aanmelden horen */
  audit: { at: Date; action: string; summary: string }[];
}

export interface TijdlijnItem {
  key: string;
  at: Date | null;
  tekst: string;
  tone: "ok" | "warn" | "crit" | "trust" | "neutral";
}

const AUDIT_TEKST: Record<string, { tekst: string; tone: TijdlijnItem["tone"] }> = {
  "auth.register": { tekst: "Account aangemaakt (aanmelding)", tone: "neutral" },
  "auth.email.changed-before-verify": { tekst: "E-mailadres gewijzigd vóór bevestiging", tone: "warn" },
  "admin.onboarding.verification_mail_resent": { tekst: "Verificatiemail opnieuw gestuurd door een beheerder", tone: "neutral" },
  "admin.onboarding.email_marked_verified": { tekst: "E-mailadres door een beheerder op bevestigd gezet", tone: "warn" },
  "admin.onboarding.reminder_sent": { tekst: "Herinnering door een beheerder gestuurd", tone: "neutral" },
  "employer.onboarding": { tekst: "Bedrijfsgegevens en vestiging ingevuld", tone: "ok" },
  "admin.company.approved": { tekst: "Bedrijf door een beheerder goedgekeurd", tone: "trust" },
};

/** Alleen de auditacties die in de tijdlijn horen. */
export function isOnboardingAudit(action: string): boolean {
  return Object.hasOwn(AUDIT_TEKST, action);
}

/** De gebeurtenissen die we echt kennen, oudste eerst; wat nog moet gebeuren staat als open item onderaan. */
export function tijdlijn(i: TijdlijnInvoer): TijdlijnItem[] {
  const items: TijdlijnItem[] = [{ key: "aangemeld", at: i.aangemeld, tekst: "Aangemeld", tone: "neutral" }];
  i.audit.forEach((a, n) => {
    const def = Object.hasOwn(AUDIT_TEKST, a.action) ? AUDIT_TEKST[a.action] : undefined;
    if (def && a.action !== "auth.register") items.push({ key: `audit-${n}`, at: a.at, tekst: def.tekst, tone: def.tone });
  });
  if (i.emailBevestigdOp) items.push({ key: "email", at: i.emailBevestigdOp, tekst: "E-mailadres bevestigd", tone: "ok" });
  if (i.profielAangemaakt) items.push({ key: "profiel", at: i.profielAangemaakt, tekst: "Werkersprofiel aangemaakt", tone: "ok" });
  i.identiteit.forEach((c, n) =>
    items.push({ key: `id-${n}`, at: c.at, tekst: `Identiteitscontrole: ${c.label}`, tone: c.goed === true ? "trust" : c.goed === false ? "crit" : "warn" }),
  );
  if (i.herinneringen.aantal > 0) {
    items.push({
      key: "herinneringen",
      at: i.herinneringen.laatsteOp,
      tekst: `${i.herinneringen.aantal} ${i.herinneringen.aantal === 1 ? "herinnering" : "herinneringen"} gestuurd`,
      tone: "neutral",
    });
  }
  if (i.laatsteInlog) items.push({ key: "inlog", at: i.laatsteInlog, tekst: "Laatst ingelogd", tone: "neutral" });
  items.sort((a, b) => (a.at?.getTime() ?? Infinity) - (b.at?.getTime() ?? Infinity));

  const open: TijdlijnItem[] = [];
  if (!i.emailBevestigdOp) open.push({ key: "open-email", at: null, tekst: "E-mailadres nog niet bevestigd", tone: "warn" });
  if (i.soort) items.push({ key: "soort", at: null, tekst: `Soort gekozen: ${i.soort}`, tone: "ok" });
  return [...items, ...open];
}
