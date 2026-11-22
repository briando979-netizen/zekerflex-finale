// ---------------------------------------------------------------------------
// Inchecken is optioneel per bedrijf (22 nov 2026, eigenaar: "laat een bedrijf zelf kiezen: ja gebruik maken van de check-in,
// nee hoeft niet"). Standaard AAN, zoals het altijd werkte. Staat het uit voor een bedrijf, dan:
//  - hoeft de werker bij een klus van dat bedrijf niet in te checken (geen QR, geen GPS-controle; een nieuwe check-in wordt
//    niet meer aangenomen, een check-in van vóór het uitzetten telt gewoon mee);
//  - dient hij na afloop zijn uren in, en is de goedkeuring van het bedrijf zelf het bewijs van aanwezigheid;
//  - worden die uren nooit automatisch goedgekeurd (lib/autopilot/actions.ts): het bedrijf keurt elke urenregel zelf goed.
// Facturen en platformkosten volgen de goedgekeurde uren zoals altijd (lib/timesheets/approve.ts).
// Puur bestand (geen prisma of kv): de opslag staat in lib/checkin/vereist.ts.
// ---------------------------------------------------------------------------

/** Wat er per bedrijf wordt bewaard. Geen gebruikers-id: wie het wijzigde staat in het auditspoor. */
export interface IncheckInstelling {
  /** false = het bedrijf vraagt geen inchecken */
  vereist: boolean;
  /** wanneer het bedrijf inchecken uitzette (ISO), voor de weergave */
  sinds: string | null;
}

/** Zonder keuze van het bedrijf: inchecken is nodig, zoals het altijd werkte. */
export const STANDAARD_INCHECK: IncheckInstelling = { vereist: true, sinds: null };

/** Soepel lezen: alleen een uitdrukkelijk `vereist: false` zet inchecken uit; al het andere (leeg, rommel) is de standaard. */
export function leesIncheckInstelling(raw: unknown): IncheckInstelling {
  if (!raw || typeof raw !== "object") return STANDAARD_INCHECK;
  const o = raw as { vereist?: unknown; sinds?: unknown };
  if (o.vereist !== false) return STANDAARD_INCHECK;
  return { vereist: false, sinds: typeof o.sinds === "string" ? o.sinds : null };
}

/**
 * Is dit urenbriefje "zonder inchecken": het bedrijf vraagt geen inchecken én de werker heeft ook niet ingecheckt. Wie toch
 * ingecheckt had (bijvoorbeeld vóór het uitzetten) valt hier niet onder: zijn check-in wordt gewoon gecontroleerd.
 */
export function zonderInchecken(vereist: boolean, heeftCheckIn: boolean): boolean {
  return !vereist && !heeftCheckIn;
}

/**
 * De slotregel van het agenda-item bij een klus (Google/Apple-agenda; Nederlands, zoals de rest van dat item) voor een bedrijf zonder
 * inchecken, in plaats van "check op tijd in op locatie". Hier en niet in de pagina: tests/werker-taal-bewaker.test.ts telt vaste zinnen.
 */
export const AGENDA_ZONDER_INCHECKEN = "Bevestig je komst in de app. Dit bedrijf vraagt geen inchecken: dien na afloop je uren in.";

/** Welke tekst de werker bij zijn uren ziet: nog in te dienen, ingediend, of ook door het bedrijf goedgekeurd. */
export type ZonderIncheckenStand = "open" | "ingediend" | "goedgekeurd";

export function zonderIncheckenStand(status: string): ZonderIncheckenStand {
  if (status === "APPROVED" || status === "PAID") return "goedgekeurd";
  if (status === "SUBMITTED" || status === "DISPUTED") return "ingediend";
  return "open";
}
