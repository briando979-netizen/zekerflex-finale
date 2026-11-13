import type { FreelancerDict } from "@/lib/i18n/freelancer";
import { vulIn } from "@/lib/i18n/vul-in";
import { poortStapVan, type WerkerPoortFeiten } from "@/lib/onboarding/werker-poort";
import { volgendeStapHref, type PoortSleutel } from "@/lib/onboarding/volgende-stap";

// ---------------------------------------------------------------------------
// De kaart "Stap n van 5: <stap>" met een knop erheen, op het eindscherm van /dashboard/verificatie (14 nov 2026). Gemeten:
// van de 19 werkers met een ID die nog niet klaar waren, stonden er 12 stil bij de branches; die kies je in de wizard bij
// Klussen, maar dit scherm zei alleen "Nog 1 stap te gaan!", zonder te zeggen welke of waar. De foto heeft al een eigen
// kaart, en de ID is op dit scherm altijd al ingestuurd. Teksten van de wizard (start.*Step, *Hint) en van de ID-scan
// ("Verder: {stap}"), dus vijf talen. Puur.
// ---------------------------------------------------------------------------

export interface VerderKaart {
  sleutel: PoortSleutel;
  teller: string;
  naam: string;
  uitleg: string;
  knop: string;
  href: string;
}

export function verderKaart(
  poort: WerkerPoortFeiten | null,
  start: Pick<FreelancerDict["start"], "stapVan" | "kindStep" | "brancheStep" | "gegevensStep" | "identiteitStep" | "kindHint" | "brancheHint" | "gegevensBody" | "identiteitBody">,
  knop: string,
): VerderKaart | null {
  const stap = poort ? poortStapVan(poort) : null;
  if (!stap || stap.sleutel === "foto" || stap.sleutel === "identiteit") return null;
  const naam = { kind: start.kindStep, branches: start.brancheStep, gegevens: start.gegevensStep }[stap.sleutel];
  const uitleg = { kind: start.kindHint, branches: start.brancheHint, gegevens: start.gegevensBody }[stap.sleutel];
  return {
    sleutel: stap.sleutel,
    teller: vulIn(start.stapVan, { n: stap.n, totaal: stap.totaal }),
    naam,
    uitleg,
    knop: vulIn(knop, { stap: naam }),
    href: volgendeStapHref(stap.sleutel),
  };
}
