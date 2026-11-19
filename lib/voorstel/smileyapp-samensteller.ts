import { BRANCHE_LIJST, type Vraagsoort } from "@/lib/voorstel/smileyapp-branches";

// ---------------------------------------------------------------------------
// "Stel je eigen vragenlijst samen" in het SmileyApp-voorstel (deel 6b): de
// bezoeker kiest hooguit vijf voorbeeldvragen en mag er één eigen vraag bij
// typen. De voorbeeldvragen zijn die van de branchepagina's
// (lib/voorstel/smileyapp-branches.ts): voorbeelden van ZekerFlex, geen vragen
// van een klant van Smileyapp, en zo heten ze ook op de pagina. De keuze gaat
// in de adresbalk mee naar de demo-aanvraag (alleen de id's van vaste vragen en
// de eigen vraag) en komt daar als leesbare tekst in het berichtveld. Er wordt
// niets bewaard vóór de aanvraag. Puur bestand: ook het scherm in de browser
// laadt het.
// ---------------------------------------------------------------------------

export const KEUZE_MAX = 5;
export const EIGEN_MAX = 120;

/** Een korte sleutel per soort vraag: daarmee kiest het scherm het antwoordvak en de vertaling het etiket. */
export type SoortSleutel = "rating" | "open" | "janee" | "tekstveld";
export const SOORT_SLEUTEL: Record<Vraagsoort, SoortSleutel> = {
  "1-10 rating vragen": "rating",
  "open vragen": "open",
  "ja/nee vragen": "janee",
  "een leeg tekstveld om feedback en gegevens te vragen": "tekstveld",
};

export interface KeuzeVraag {
  /** vast id: de branche en het volgnummer van de vraag, zoals "horeca-1" */
  id: string;
  branche: string;
  /** de naam van de branche: de groep waaronder de vraag in de lijst staat */
  groep: string;
  soort: SoortSleutel;
  tekst: string;
}

/** Alle voorbeeldvragen van de branches, in de volgorde van de branchepagina's. */
export const KEUZEVRAGEN: readonly KeuzeVraag[] = BRANCHE_LIJST.flatMap((b) =>
  b.vragen.map((v, i) => ({ id: `${b.slug}-${i + 1}`, branche: b.slug, groep: b.naam, soort: SOORT_SLEUTEL[v.soort], tekst: v.tekst })),
);

const OP_ID: Record<string, KeuzeVraag> = Object.fromEntries(KEUZEVRAGEN.map((v) => [v.id, v]));

/** Bestaat deze vaste vraag? Een onbekend id (ook "constructor") bestaat niet. */
export const isKeuzeId = (id: unknown): id is string => typeof id === "string" && Object.hasOwn(OP_ID, id);

/** De id's van de vijf voorbeeldvragen van één branche, voor de link vanaf een branchepagina. */
export const brancheKeuze = (slug: string): string[] => KEUZEVRAGEN.filter((v) => v.branche === slug).map((v) => v.id);

export interface Keuze {
  /** de gekozen vaste vragen, in de volgorde van kiezen */
  ids: string[];
  /** de eigen vraag; leeg als er geen is */
  eigen: string;
}

export const LEGE_KEUZE: Keuze = { ids: [], eigen: "" };

/** De eigen vraag als één regel platte tekst van hooguit 120 tekens. */
export function schoonEigen(ruw: unknown): string {
  if (typeof ruw !== "string") return "";
  const schoon = ruw
    .slice(0, 2000)
    .replace(/[\p{Cc}\p{Cf}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  // op hele tekens knippen: een emoji is twee code-eenheden, en een half teken geeft op de server iets anders dan in de browser
  return [...schoon].slice(0, EIGEN_MAX).join("").trim();
}

/** Een keuze van buiten (adresbalk) opgeschoond: alleen bestaande vragen, elk één keer, hooguit vijf, en de eigen vraag begrensd. */
export function schoonKeuze(ids: unknown, eigen: unknown): Keuze {
  const uit: string[] = [];
  for (const id of Array.isArray(ids) ? ids.slice(0, 50) : []) {
    if (isKeuzeId(id) && !uit.includes(id) && uit.length < KEUZE_MAX) uit.push(id);
  }
  return { ids: uit, eigen: schoonEigen(eigen) };
}

export const isLeeg = (k: Keuze) => k.ids.length === 0 && k.eigen === "";

/** Zet een vaste vraag aan of uit. Aanzetten kan alleen zolang er minder dan vijf gekozen zijn. */
export function wisselVraag(k: Keuze, id: string): Keuze {
  if (k.ids.includes(id)) return { ...k, ids: k.ids.filter((x) => x !== id) };
  if (!isKeuzeId(id) || k.ids.length >= KEUZE_MAX) return k;
  return { ...k, ids: [...k.ids, id] };
}

/** De keuze als querystring voor de demo-aanvraag: "vragen=horeca-1,zorg-2&eigen=…". Leeg zonder keuze. */
export function keuzeNaarZoek(keuze: Keuze): string {
  const k = schoonKeuze(keuze.ids, keuze.eigen);
  const p = new URLSearchParams();
  if (k.ids.length) p.set("vragen", k.ids.join(","));
  if (k.eigen) p.set("eigen", k.eigen);
  return p.toString();
}

type ZoekWaarde = string | string[] | undefined;
const eerste = (q: ZoekWaarde) => (Array.isArray(q) ? q[0] : q);

/** De keuze uit de adresbalk (de zoekwaarden van de pagina). Alles wat niet klopt valt weg. */
export function keuzeUitZoek(zoek: { vragen?: ZoekWaarde; eigen?: ZoekWaarde }): Keuze {
  const ruw = eerste(zoek.vragen);
  return schoonKeuze(typeof ruw === "string" ? ruw.slice(0, 600).split(",") : [], eerste(zoek.eigen));
}

/**
 * De keuze als leesbare tekst voor het berichtveld van de demo-aanvraag. `vragen` levert de tekst per id (in de taal
 * van de pagina), `t` de kop en de regel voor de eigen vraag ("Eigen vraag: {vraag}"). Leeg zonder keuze.
 */
export function keuzeAlsTekst(keuze: Keuze, vragen: readonly Pick<KeuzeVraag, "id" | "tekst">[], t: { berichtKop: string; berichtEigen: string }): string {
  const k = schoonKeuze(keuze.ids, keuze.eigen);
  const regels = k.ids.map((id) => vragen.find((v) => v.id === id)?.tekst ?? "").filter(Boolean);
  if (k.eigen) regels.push(t.berichtEigen.replace("{vraag}", () => k.eigen));
  if (regels.length === 0) return "";
  return [t.berichtKop, ...regels.map((r, i) => `${i + 1}. ${r}`)].join("\n");
}
