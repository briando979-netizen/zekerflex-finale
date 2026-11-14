// ---------------------------------------------------------------------------
// Validatie van het demoformulier (components/marketing/DemoBooking.tsx), puur,
// zodat het scherm precies kan zeggen wat er nog ontbreekt.
//
// Gemeten 14 nov 2026 (30 dagen): zes bezoekers kozen een dag en een tijd en
// haakten daarna af op het gegevensformulier; niemand drukte op "Demo aanvragen".
// De knop stond uit zolang niet alle verplichte velden gevuld waren, zonder te
// zeggen waarom. Nu blijft hij aan en noemt een melding de ontbrekende velden.
// ---------------------------------------------------------------------------

export interface DemoFormulier {
  firstName: string;
  lastName: string;
  email: string;
  company: string;
}

const VELDEN: readonly { sleutel: keyof DemoFormulier; naam: string; code: string }[] = [
  { sleutel: "firstName", naam: "je voornaam", code: "voornaam" },
  { sleutel: "lastName", naam: "je achternaam", code: "achternaam" },
  { sleutel: "email", naam: "je e-mailadres", code: "email" },
  { sleutel: "company", naam: "de bedrijfsnaam", code: "bedrijf" },
];

/** Hetzelfde patroon als de server (z.string().email()): iets@iets.iets, zonder spaties. */
export function lijktEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());
}

/**
 * Eén Nederlandse zin over wat nog ontbreekt, of null als alles klopt.
 * Volgorde: lege velden, dan een ongeldig e-mailadres, dan het vinkje.
 */
export function ontbrekendInDemo(form: DemoFormulier, consent: boolean): string | null {
  const leeg = VELDEN.filter((v) => !form[v.sleutel].trim()).map((v) => v.naam);
  if (leeg.length) return `Vul nog in: ${opsomming(leeg)}.`;
  if (!lijktEmail(form.email)) return "Controleer je e-mailadres: daar moet een @ en een punt in staan.";
  if (!consent) return "Zet het vinkje voor akkoord om te bevestigen.";
  return null;
}

/**
 * De code van het eerste wat ontbreekt (voor de anonieme meting, lib/analytics/formulier-meting.ts):
 * een veldnaam, "email-ongeldig" of "akkoord"; null als alles klopt. Dezelfde volgorde als de zin.
 */
export function ontbrekendVeldInDemo(form: DemoFormulier, consent: boolean): string | null {
  const leeg = VELDEN.find((v) => !form[v.sleutel].trim());
  if (leeg) return leeg.code;
  if (!lijktEmail(form.email)) return "email-ongeldig";
  if (!consent) return "akkoord";
  return null;
}

function opsomming(delen: string[]): string {
  if (delen.length <= 1) return delen[0] ?? "";
  return `${delen.slice(0, -1).join(", ")} en ${delen[delen.length - 1]}`;
}
