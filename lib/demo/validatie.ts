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

const VELDEN: readonly { sleutel: keyof DemoFormulier; naam: string }[] = [
  { sleutel: "firstName", naam: "je voornaam" },
  { sleutel: "lastName", naam: "je achternaam" },
  { sleutel: "email", naam: "je e-mailadres" },
  { sleutel: "company", naam: "de bedrijfsnaam" },
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

function opsomming(delen: string[]): string {
  if (delen.length <= 1) return delen[0] ?? "";
  return `${delen.slice(0, -1).join(", ")} en ${delen[delen.length - 1]}`;
}
