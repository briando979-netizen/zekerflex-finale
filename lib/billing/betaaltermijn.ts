import type { InvoiceType } from "@prisma/client";
import { INVOICE_DUE_DAYS, WERKER_FACTUUR_DAGEN } from "@/lib/claims/policy";
import { amsterdamParts, amsterdamToUtc } from "@/lib/time/amsterdam";

// ---------------------------------------------------------------------------
// Betaaltermijnen van facturen aan een bedrijf (22 nov 2026, eigenaar). Bij een gewerkte klus krijgt het bedrijf twee
// facturen op dezelfde dag:
//   - de factuur van de werker (SELF_BILL_FREELANCER): te betalen binnen 30 dagen (WERKER_FACTUUR_DAGEN);
//   - de factuur van het platform (PLATFORM_FEE, ook UITZEND_FEE): binnen 14 dagen (INVOICE_DUE_DAYS, voorwaarden art. 4).
// Eén bron voor de vervaldatum: persistInvoice zet hem op de factuur, dueDateOf (herinneringen, Admin → Facturen) en de
// e-factuur vallen er voor facturen zonder dueAt op terug, en de pdf en de mail noemen dezelfde termijn.
// Puur (geen prisma): server én test gebruiken het zonder mocks.
// ---------------------------------------------------------------------------

const DAG_MS = 86_400_000;

/** De betaaltermijn in dagen van een factuur van dit soort. */
export function betaaltermijnDagen(type: InvoiceType): number {
  return type === "SELF_BILL_FREELANCER" ? WERKER_FACTUUR_DAGEN : INVOICE_DUE_DAYS;
}

/**
 * `d` plus `n` kalenderdagen op dezelfde klokslag in Amsterdam. Rond de klokwissel is een dag 23 of 25 uur: n × 24 uur
 * optellen schuift de klok een uur op.
 */
export function plusAmsterdamDagen(d: Date, n: number): Date {
  const p = amsterdamParts(d);
  const dag = new Date(Date.UTC(p.year, p.month - 1, p.day + n));
  const vast = amsterdamToUtc(dag.getUTCFullYear(), dag.getUTCMonth() + 1, dag.getUTCDate(), p.hour, p.minute, d.getUTCSeconds());
  return new Date(vast.getTime() + d.getUTCMilliseconds());
}

/** De vervaldatum van een factuur van dit soort die op `uitgifte` is uitgegeven. */
export function vervaldatumVoor(type: InvoiceType, uitgifte: Date): Date {
  return plusAmsterdamDagen(uitgifte, betaaltermijnDagen(type));
}

export interface TermijnFactuur {
  type: InvoiceType;
  dueAt: Date | null;
  issuedAt: Date | null;
  createdAt: Date;
}

/** De vervaldatum op de factuur zelf, anders de uitgiftedatum plus de termijn van zijn soort. */
export function vervaldatumVan(inv: TermijnFactuur): Date {
  return inv.dueAt ?? vervaldatumVoor(inv.type, inv.issuedAt ?? inv.createdAt);
}

const dagNummer = (d: Date): number => {
  const p = amsterdamParts(d);
  return Math.round(Date.UTC(p.year, p.month - 1, p.day) / DAG_MS);
};

const datumNl = (d: Date) => d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" });

/**
 * De termijn in gewone woorden, voor de pdf en de mail: "binnen 30 dagen, uiterlijk 19 november 2026". Heeft een factuur een
 * eigen vervaldatum die niet bij zijn soort hoort (een domeinnaam), dan staat er alleen "uiterlijk 19 november 2026".
 */
export function betaaltermijnTekst(inv: TermijnFactuur): string {
  const vervalt = vervaldatumVan(inv);
  const uiterlijk = `uiterlijk ${datumNl(vervalt)}`;
  const dagen = dagNummer(vervalt) - dagNummer(inv.issuedAt ?? inv.createdAt);
  return dagen === betaaltermijnDagen(inv.type) ? `binnen ${dagen} dagen, ${uiterlijk}` : uiterlijk;
}
