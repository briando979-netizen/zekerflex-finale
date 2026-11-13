import { VASTE_PAGINAS, type VastePaginaId } from "@/lib/ontwerp/vaste-paginas";

// ---------------------------------------------------------------------------
// De tussenruimte boven de onderdelen van de startschermen van de werkgevers-app: het gewone scherm (app/werkgever/page.tsx)
// en dat van rijschool, horeca en website (components/app/werkruimte/WerkruimteStart.tsx). De onderdelen zijn te verslepen en
// te verbergen in de Site-ontwerper (lib/ontwerp/vaste-paginas.ts, "werkgever-start" en "werkruimte-start"). In de
// oorspronkelijke volgorde heeft elk onderdeel zijn eigen ruimte, precies zoals het scherm was. Bij een eigen indeling krijgt
// elk onderdeel dezelfde ruimte en het bovenste geen: anders plakt een verplaatst onderdeel tegen zijn buurman of staat er een
// gat boven. Puur bestand.
// ---------------------------------------------------------------------------

const STANDAARD: Record<string, string> = { cijfers: "", volgers: "mt-4", beoordelingen: "mt-8", werk: "mt-8", berichten: "mt-6", facturen: "mt-6" };
// "concept" (de herinnering aan een klus van de website) regelt zijn eigen ruimte en staat er meestal niet
const STANDAARD_WERKRUIMTE: Record<string, string> = { cijfers: "", onderdelen: "mt-6", concept: "", extra: "mt-6", personeel: "mt-6" };

function marges(pagina: VastePaginaId, standaard: Record<string, string>, zichtbaar: readonly string[], leeg: Readonly<Record<string, boolean>>): Record<string, string> {
  const oud = VASTE_PAGINAS[pagina].secties.map((s) => s.id);
  if (zichtbaar.length === oud.length && zichtbaar.every((id, i) => id === oud[i])) return { ...standaard };
  const eerste = zichtbaar.find((id) => !(Object.hasOwn(leeg, id) && leeg[id]));
  const uit: Record<string, string> = {};
  for (const id of oud) uit[id] = id === eerste ? "" : "mt-6";
  return uit;
}

/**
 * De klasse met de ruimte boven elk onderdeel. `zichtbaar` komt uit zichtbareSecties; `leeg` zegt welke onderdelen nu niets
 * tonen (geen volgers, niets te beoordelen, geen berichten), zodat het eerste onderdeel dat er echt staat bovenaan aansluit.
 */
export function startMarges(zichtbaar: readonly string[], leeg: Readonly<Record<string, boolean>> = {}): Record<string, string> {
  return marges("werkgever-start", STANDAARD, zichtbaar, leeg);
}

/** Hetzelfde voor het startscherm van rijschool, horeca en website. */
export function werkruimteMarges(zichtbaar: readonly string[]): Record<string, string> {
  return marges("werkruimte-start", STANDAARD_WERKRUIMTE, zichtbaar, { concept: true });
}

/** Klassen aan elkaar, zonder lege stukken; niets over = geen class-attribuut. */
export function kl(...delen: (string | undefined)[]): string | undefined {
  const s = delen.filter(Boolean).join(" ");
  return s || undefined;
}
