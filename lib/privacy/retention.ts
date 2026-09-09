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
  /** Human description of the data category. */
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
    label: "Accountgegevens (naam, e-mail, telefoon, wachtwoordhash)",
    days: 0,
    anchor: "account gesloten / verwijderverzoek",
    basis: "Geen grondslag na beëindiging — art. 17 AVG",
    onExpiry: "anonymise",
    blocksErasure: false,
  },
  {
    key: "freelancer_profile",
    label: "Freelancer-profiel (KVK, btw, IBAN, thuisadres/-locatie)",
    days: 0,
    anchor: "account gesloten / verwijderverzoek",
    basis: "Geen grondslag na beëindiging; IBAN alleen tijdens actieve relatie",
    onExpiry: "anonymise",
    blocksErasure: false,
  },
  {
    key: "kyc",
    label: "Identiteitsverificatie — ruwe Didit-payload, biometrie-scores, documentnummer-hash",
    days: 30,
    anchor: "verificatie afgerond of afgekeurd",
    basis:
      "Dataminimalisatie: de pass/fail-beslissing blijft (bewijs van zorgvuldigheid), de onderliggende paspoort-/biometriegegevens worden na 30 dagen gewist",
    onExpiry: "delete",
    blocksErasure: false,
  },
  {
    key: "device_fingerprint",
    label: "Apparaat-fingerprints (fraudedetectie)",
    days: 180,
    anchor: "laatst gezien",
    basis: "Gerechtvaardigd belang (fraudepreventie), tijdelijk",
    onExpiry: "delete",
    blocksErasure: false,
  },
  {
    key: "web_push",
    label: "Web Push-abonnementen",
    days: 0,
    anchor: "account gesloten / verwijderverzoek",
    basis: "Toestemming ingetrokken",
    onExpiry: "delete",
    blocksErasure: false,
  },
  {
    key: "gps_events",
    label: "GPS check-in/-out-events bij urenstaten",
    days: 2 * YEAR,
    anchor: "dienst gewerkt",
    basis: "Bewijs bij urengeschil; daarna niet meer nodig",
    onExpiry: "delete",
    blocksErasure: true,
  },
  {
    key: "timesheets",
    label: "Urenstaten",
    days: 7 * YEAR,
    anchor: "dienst gewerkt",
    basis: "Fiscale bewaarplicht (art. 52 AWR) — loon-/factuuronderbouwing",
    onExpiry: "anonymise",
    blocksErasure: true,
  },
  {
    key: "invoices_payments",
    label: "Facturen, self-billing en betaalopdrachten",
    days: 7 * YEAR,
    anchor: "factuur uitgereikt",
    basis: "Fiscale bewaarplicht (art. 52 AWR)",
    onExpiry: "anonymise",
    blocksErasure: true,
  },
  {
    key: "model_agreements",
    label: "Modelovereenkomsten (Wet DBA)",
    days: 7 * YEAR,
    anchor: "overeenkomst beëindigd",
    basis: "Fiscale bewaarplicht + Wet DBA-onderbouwing",
    onExpiry: "anonymise",
    blocksErasure: true,
  },
  {
    key: "payroll",
    label: "Loonstroken / payroll-runs (uitzendkrachten)",
    days: 7 * YEAR,
    anchor: "loonjaar afgesloten",
    basis: "Fiscale + loonadministratie-bewaarplicht",
    onExpiry: "anonymise",
    blocksErasure: true,
  },
  {
    key: "audit_log",
    label: "Auditlog (append-only)",
    days: 7 * YEAR,
    anchor: "regel geschreven",
    basis: "Verantwoording / beveiliging; PII wordt eerder geanonimiseerd",
    onExpiry: "anonymise",
    blocksErasure: true,
  },
  {
    key: "engagement_events",
    label: "Gedrags-/engagement-events (matching-signalen)",
    days: YEAR,
    anchor: "event vastgelegd",
    basis: "Gerechtvaardigd belang (matchkwaliteit), tijdelijk",
    onExpiry: "delete",
    blocksErasure: false,
  },
  {
    key: "password_reset_tokens",
    label: "Wachtwoord-reset-tokens",
    days: 1,
    anchor: "aangemaakt",
    basis: "Alleen geldig binnen het resetvenster",
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
