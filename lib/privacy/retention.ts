// ---------------------------------------------------------------------------
// Retention schedule (AVG / GDPR art. 5(1)(e), 17).
//
// Policy-as-code: for every category of personal data the platform holds, how
// long it is kept, on what legal basis, and what happens when that period
// lapses. This is the single reference the erasure flow (`anonymizeUser`) and
// the retention sweep consult — change a period here, not in scattered jobs.
//
// "anonymise" = keep the row for its structural / statistical value but strip
// every direct and indirect identifier. "delete" = remove the row (and its
// file bytes) entirely.
//
// A legal retention duty (tax, ABU, Wet DBA) OUTWEIGHS an erasure request for
// the categories marked `blocksErasure: true` — those are anonymised only once
// the duty has expired, never on request.
// ---------------------------------------------------------------------------

export type RetentionAction = "anonymise" | "delete";

export interface RetentionRule {
  /** Stable key, also used in the erasure report. */
  key: string;
  /** Human description of the data category. Gewone woorden: deze tekst staat letterlijk op de verwijderpagina's (16 nov 2026). */
  label: string;
  /** Retention period in days, counted from the anchor event. */
  days: number;
  /** What the anchor is ("account closed", "invoice issued", ...). */
  anchor: string;
  /** Legal basis / duty that sets the period. */
  basis: string;
  /** What happens when the period lapses. */
  onExpiry: RetentionAction;
  /**
   * True when a statutory retention duty means this data survives an erasure
   * request and is only cleared once `days` have passed.
   */
  blocksErasure: boolean;
}

const YEAR = 365;

export const RETENTION_RULES: readonly RetentionRule[] = [
  {
    key: "account",
    label: "Accountgegevens (naam, e-mail, telefoon en je versleutelde wachtwoord)",
    days: 0,
    anchor: "account gesloten / verwijderverzoek",
    basis: "Geen grondslag na beëindiging — art. 17 AVG",
    onExpiry: "anonymise",
    blocksErasure: false,
  },
  {
    key: "freelancer_profile",
    label: "Je profiel als freelancer, als je er een hebt (KVK- en btw-nummer, IBAN, thuisadres en locatie)",
    days: 0,
    anchor: "account gesloten / verwijderverzoek",
    basis: "Geen grondslag na beëindiging; IBAN alleen tijdens actieve relatie",
    onExpiry: "anonymise",
    blocksErasure: false,
  },
  {
    key: "kyc",
    label: "Gegevens van je identiteitscontrole: wat de controle over je document en je gezicht teruggaf, de uitslag van de gezichtsvergelijking en een onleesbaar gemaakte versie van je documentnummer",
    days: 30,
    anchor: "verificatie afgerond of afgekeurd",
    basis:
      "Dataminimalisatie: de pass/fail-beslissing blijft (bewijs van zorgvuldigheid), de onderliggende paspoort-/biometriegegevens worden na 30 dagen gewist",
    onExpiry: "delete",
    blocksErasure: false,
  },
  {
    key: "device_fingerprint",
    label: "Herkenning van je toestel (om fraude te voorkomen)",
    days: 180,
    anchor: "laatst gezien",
    basis: "Gerechtvaardigd belang (fraudepreventie), tijdelijk",
    onExpiry: "delete",
    blocksErasure: false,
  },
  {
    key: "web_push",
    label: "Aanmeldingen voor meldingen op je telefoon of computer (pushberichten)",
    days: 0,
    anchor: "account gesloten / verwijderverzoek",
    basis: "Toestemming ingetrokken",
    onExpiry: "delete",
    blocksErasure: false,
  },
  {
    key: "gps_events",
    label: "Je locatie bij het in- en uitchecken, bij je urenstaten",
    days: 2 * YEAR,
    anchor: "dienst gewerkt",
    basis: "Bewijs bij onenigheid over de uren; daarna niet meer nodig",
    onExpiry: "delete",
    blocksErasure: true,
  },
  {
    key: "rijschool_lesroutes",
    label: "Lesroutes van rijlessen (de gereden route in grote lijnen, opgenomen door de instructeur)",
    days: 2 * YEAR,
    anchor: "les gereden",
    basis: "Inzicht in de rijopleiding voor de leerling; daarna niet meer nodig",
    onExpiry: "delete",
    blocksErasure: false,
  },
  {
    key: "rijschool_berichten",
    label: "Berichten tussen leerling en rijschool in de app",
    days: 2 * YEAR,
    anchor: "bericht verstuurd",
    basis: "Contact over de rijopleiding; daarna niet meer nodig",
    onExpiry: "delete",
    blocksErasure: false,
  },
  {
    key: "horeca_gasten",
    label: "Gastgegevens bij horecareserveringen en -bestellingen (naam, e-mail, telefoon, opmerking); een tafelreservering via een klantsite gaat dan helemaal weg",
    days: YEAR,
    anchor: "dag van de reservering / bestelling",
    basis: "Alleen nodig voor de reservering en de nazorg; daarna geen grondslag. Datum, tijd, aantal personen en bedragen blijven voor de cijfers van de zaak",
    onExpiry: "anonymise",
    blocksErasure: false,
  },
  {
    key: "timesheets",
    label: "Urenstaten",
    days: 7 * YEAR,
    anchor: "dienst gewerkt",
    basis: "Wettelijke bewaarplicht voor de belasting (art. 52 AWR), als onderbouwing van loon en facturen",
    onExpiry: "anonymise",
    blocksErasure: true,
  },
  {
    key: "invoices_payments",
    label: "Facturen (ook die ZekerFlex namens jou opmaakt) en betaalopdrachten",
    days: 7 * YEAR,
    anchor: "factuur uitgereikt",
    basis: "Wettelijke bewaarplicht voor de belasting (art. 52 AWR)",
    onExpiry: "anonymise",
    blocksErasure: true,
  },
  {
    key: "model_agreements",
    label: "Modelovereenkomsten (Wet DBA)",
    days: 7 * YEAR,
    anchor: "overeenkomst beëindigd",
    basis: "Wettelijke bewaarplicht voor de belasting en als onderbouwing voor de Wet DBA",
    onExpiry: "anonymise",
    blocksErasure: true,
  },
  {
    key: "payroll",
    label: "Loonstroken en loonberekeningen (uitzendkrachten)",
    days: 7 * YEAR,
    anchor: "loonjaar afgesloten",
    basis: "Wettelijke bewaarplicht voor de belasting en de loonadministratie",
    onExpiry: "anonymise",
    blocksErasure: true,
  },
  {
    key: "audit_log",
    label: "Logboek van wat er op het platform is gedaan (achteraf niet te wijzigen)",
    days: 7 * YEAR,
    anchor: "regel geschreven",
    basis: "Verantwoording en beveiliging; je persoonsgegevens worden er eerder uit gehaald",
    onExpiry: "anonymise",
    blocksErasure: true,
  },
  {
    key: "chatlog",
    label: "Vragen en antwoorden in de assistenten (de chat op de site en de assistenten in de app) en de beoordelingen daarvan",
    days: 90,
    anchor: "vraag gesteld",
    basis: "Alleen om de antwoorden te verbeteren; daarna geen grondslag — dataminimalisatie (art. 5(1)(c) en (e) AVG). E-mailadressen, telefoonnummers, rekeningnummers en BSN's worden al vóór het bewaren weggehaald",
    onExpiry: "delete",
    blocksErasure: false,
  },
  {
    key: "engagement_events",
    label: "Wat je in de app doet (zoals de app openen en klussen bekijken), om je beter passend werk te tonen",
    days: YEAR,
    anchor: "event vastgelegd",
    basis: "Gerechtvaardigd belang (matchkwaliteit), tijdelijk",
    onExpiry: "delete",
    blocksErasure: false,
  },
  {
    key: "bezoekstatistiek",
    label: "Bezoekstatistiek: bekeken pagina's en klikken op het platform, zonder cookies (aan je account gekoppeld als je was ingelogd)",
    // 13 maanden (zo staat het in /privacy): een maand blijft te vergelijken met dezelfde maand een jaar eerder
    days: YEAR + 30,
    anchor: "bezoek vastgelegd",
    basis: "Gerechtvaardigd belang (het platform verbeteren), tijdelijk",
    onExpiry: "delete",
    blocksErasure: false,
  },
  {
    key: "password_reset_tokens",
    label: "Links om je wachtwoord opnieuw in te stellen",
    days: 1,
    anchor: "aangemaakt",
    basis: "Alleen geldig binnen het resetvenster",
    onExpiry: "delete",
    blocksErasure: false,
  },
  {
    key: "passkeys",
    label: "Passkeys (inloggen met vingerafdruk, gezicht of pincode): naam van het toestel en de publieke sleutel",
    days: 0,
    anchor: "account gesloten / verwijderverzoek / zelf verwijderd",
    basis: "Alleen nodig zolang je ermee inlogt — art. 17 AVG",
    onExpiry: "delete",
    blocksErasure: false,
  },
  {
    key: "bsn_voorstel",
    label: "BSN gelezen van je ID-kaart of paspoort dat je nog niet hebt bevestigd (alleen versleuteld en de laatste 4 cijfers)",
    days: 30,
    anchor: "gelezen bij de ID-controle",
    basis: "Alleen om je het BSN te laten bevestigen voor de verloning; daarna geen grondslag — art. 5(1)(e) AVG. Een bevestigd BSN valt onder de bewaarplicht van de loonadministratie",
    onExpiry: "delete",
    blocksErasure: false,
  },
  {
    key: "personal_settings",
    label: "Persoonlijke instellingen en notities (agenda, ritten, chat, contacten, wat de assistent over je onthoudt, tweestapsverificatie)",
    days: 0,
    anchor: "account gesloten / verwijderverzoek",
    basis: "Alleen nodig zolang je account bestaat — art. 17 AVG",
    onExpiry: "delete",
    blocksErasure: false,
  },
] as const;

export function retentionRule(key: string): RetentionRule | undefined {
  return RETENTION_RULES.find((r) => r.key === key);
}

/** Categories that an erasure request clears immediately (no statutory hold). */
export function erasableNow(): RetentionRule[] {
  return RETENTION_RULES.filter((r) => !r.blocksErasure);
}

/** The cutoff `Date` for a rule: rows whose anchor is older than this expire. */
export function retentionCutoff(key: string, now: Date = new Date()): Date | null {
  const rule = retentionRule(key);
  if (!rule) return null;
  return new Date(now.getTime() - rule.days * 24 * 60 * 60 * 1000);
}
