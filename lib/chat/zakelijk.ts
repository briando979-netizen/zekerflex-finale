// ---------------------------------------------------------------------------
// De zakelijke weergave van de chat (15 nov 2026), zoals WhatsApp Business: voor bedrijven (opdrachtgevers) de bedrijfsnaam
// met "Zakelijk", een knop Zakelijke tools, gekleurde labels op gesprekken, voorgestelde labels en snelle antwoorden met
// "/". Werkers houden de gewone weergave. Puur (ook voor de browser): welke rollen zakelijk zijn, de kleur van een label
// en welke snelle antwoorden bij "/…" horen.
// ---------------------------------------------------------------------------

/** Wie de zakelijke weergave krijgt: dezelfde rollen die /berichten naar /werkgever stuurt (app/berichten/page.tsx). */
export const ZAKELIJKE_ROLLEN = ["HQ_ADMIN", "LOCAL_MANAGER", "DISPUTE_MANAGER"] as const;

export type LabelKleur = "trust" | "plan" | "amber" | "money" | "brand";

/** Alleen kleuren met een regel voor de donkere modus (app/globals.css); één kleur = één betekenis (AGENTS.md). */
const KLASSE: Record<LabelKleur, string> = {
  trust: "bg-trust-soft text-trust-ink",
  plan: "bg-plan-soft text-plan-ink",
  amber: "bg-amber-50 text-amber-800",
  money: "bg-money-soft text-money-ink",
  brand: "bg-brand-50 text-brand-700",
};

/**
 * De kleur van de voorgestelde labels, in de volgorde van de chatteksten (zakelijkeLabels): nieuwe kandidaat (violet,
 * nog te beoordelen), gesprek gepland en ingepland (blauw, gepland), uren controleren (amber, wacht op jou), factuur open
 * (goud, geld), afgerond (groen, klaar).
 */
export const VOORGESTELDE_KLEUREN: readonly LabelKleur[] = ["trust", "plan", "plan", "amber", "money", "brand"];

const VOLGORDE: readonly LabelKleur[] = ["plan", "trust", "amber", "money", "brand"];

/** De klassen voor een label: een voorgesteld label in zijn vaste kleur, een eigen label steeds in dezelfde kleur. */
export function labelKlasse(naam: string, voorgesteld: readonly string[]): string {
  const i = voorgesteld.indexOf(naam);
  if (i >= 0) return KLASSE[VOORGESTELDE_KLEUREN[i] ?? "plan"];
  let h = 0;
  for (const c of naam) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return KLASSE[VOLGORDE[h % VOLGORDE.length] ?? "plan"];
}

/** Snelle antwoorden bij "/…" in het invoerveld (zoals WhatsApp Business); null als de tekst niet met "/" begint. */
export function slashTreffers(tekst: string, snel: readonly string[]): { vraag: string; lijst: string[] } | null {
  if (!tekst.startsWith("/") || tekst.includes("\n")) return null;
  const vraag = tekst.slice(1).trim().toLowerCase();
  return { vraag, lijst: snel.filter((q) => !vraag || q.toLowerCase().includes(vraag)).slice(0, 8) };
}

/** Labels in een lijst zonder dubbelen: eerst je eigen labels, dan de voorgestelde die je nog niet hebt. */
export function labelsMetVoorstellen(eigen: readonly string[], voorgesteld: readonly string[]): string[] {
  return [...eigen, ...voorgesteld.filter((v) => !eigen.includes(v))];
}
