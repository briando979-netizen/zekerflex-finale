import { PAKKETTEN, type Pakket } from "@/lib/voorstel/smileyapp";

// ---------------------------------------------------------------------------
// "Welk pakket past bij mij?" (19 nov 2026): drie vragen, één pakket. Niets is
// hier aangenomen: de grenzen komen uit de onderdelen van de pakketten zelf
// ("1 vragenlijst", "100 beoordelingen", "Meerdere gebruikers"), ook als het
// team die in het beheer aanpast. Een pakket waar zo'n grens niet uit te lezen
// is (zoals het MKB Pakket: "Vragenlijsten en beoordelingen", zonder aantallen),
// doet niet mee; past er niets, dan is de uitkomst het pakket op aanvraag
// (Maatwerk), en dat staat er eerlijk bij. Over welke periode het aantal
// beoordelingen geldt, staat niet in de gegevens: de kiezer beweert dat dus ook
// niet. Puur bestand: de pagina geeft de pakketten mee als gewone gegevens.
// ---------------------------------------------------------------------------

export type VraagSleutel = "vragenlijsten" | "beoordelingen" | "gebruikers";
export const VRAAG_SLEUTELS: readonly VraagSleutel[] = ["vragenlijsten", "beoordelingen", "gebruikers"];

/** Wat een pakket maximaal bevat; "meerdere" = meer dan één, zonder genoemd aantal. */
type Grens = number | "meerdere";

export interface Grenzen {
  vragenlijsten: number | null;
  beoordelingen: number | null;
  gebruikers: Grens | null;
  /** het onderdeel waar de grens uit komt, letterlijk (voor de uitleg) */
  bron: Partial<Record<VraagSleutel, string>>;
}

/** "1.000" → 1000 (in de onderdelen staat een punt als duizendtal). */
const getal = (s: string) => Number(s.replace(/\./g, ""));

/** Leest de drie grenzen uit de onderdelen van een pakket; null = staat er niet (met een aantal) in. */
export function grenzenVan(p: Pick<Pakket, "onderdelen">): Grenzen {
  const g: Grenzen = { vragenlijsten: null, beoordelingen: null, gebruikers: null, bron: {} };
  for (const o of p.onderdelen) {
    const t = o.trim();
    const lijst = /^(\d[\d.]*)\s+vragenlijst(?:en)?$/i.exec(t);
    const oordeel = /^(\d[\d.]*)\s+beoordeling(?:en)?$/i.exec(t);
    const gebruiker = /^(\d[\d.]*)\s+gebruikers?$/i.exec(t);
    if (lijst?.[1]) {
      g.vragenlijsten = getal(lijst[1]);
      g.bron.vragenlijsten = t;
    } else if (oordeel?.[1]) {
      g.beoordelingen = getal(oordeel[1]);
      g.bron.beoordelingen = t;
    } else if (gebruiker?.[1]) {
      g.gebruikers = getal(gebruiker[1]);
      g.bron.gebruikers = t;
    } else if (/^meerdere gebruikers$/i.test(t)) {
      g.gebruikers = "meerdere";
      g.bron.gebruikers = t;
    }
  }
  return g;
}

/** Doet een pakket mee in de kiezer? Alleen als alle drie de grenzen uit de onderdelen te lezen zijn. */
const compleet = (g: Grenzen) => g.vragenlijsten !== null && g.beoordelingen !== null && g.gebruikers !== null;

export interface Keuze {
  /** wat de bezoeker nodig heeft: een aantal, "meerdere", of "meer" (= meer dan in elk pakket staat) */
  nodig: number | "meerdere" | "meer";
  label: string;
}

export interface KiezerVraag {
  sleutel: VraagSleutel;
  vraag: string;
  keuzes: Keuze[];
}

const duizend = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** Keuzes bij de aantallen die in de pakketten staan: [1, 10] → "1", "2 tot 10", "Meer dan 10". */
function trappen(grenzen: number[], enkel: string): Keuze[] {
  const oplopend = [...new Set(grenzen)].sort((a, b) => a - b);
  const keuzes: Keuze[] = oplopend.map((g, i) => {
    const vorige = oplopend[i - 1] ?? 0;
    return { nodig: g, label: g === vorige + 1 ? (g === 1 ? enkel : duizend(g)) : `${duizend(vorige + 1)} tot ${duizend(g)}` };
  });
  const hoogste = oplopend[oplopend.length - 1];
  return hoogste === undefined ? [] : [...keuzes, { nodig: "meer", label: `Meer dan ${duizend(hoogste)}` }];
}

/** De drie vragen, met keuzes die volgen uit wat de pakketten bevatten. */
export function kiezerVragen(pakketten: readonly Pakket[] = PAKKETTEN): KiezerVraag[] {
  const g = pakketten.map(grenzenVan).filter(compleet);
  const aantallen = (s: "vragenlijsten" | "beoordelingen") => g.map((x) => x[s]).filter((n): n is number => typeof n === "number");
  const gebruikers = g.map((x) => x.gebruikers);
  const metAantal = gebruikers.filter((n): n is number => typeof n === "number");
  const gebruikerKeuzes: Keuze[] = gebruikers.includes("meerdere")
    ? [...trappen(metAantal, "1 gebruiker").filter((k) => k.nodig !== "meer"), { nodig: "meerdere", label: "Meerdere gebruikers" }]
    : trappen(metAantal, "1 gebruiker");
  return [
    { sleutel: "vragenlijsten", vraag: "Hoeveel vragenlijsten wil je gebruiken?", keuzes: trappen(aantallen("vragenlijsten"), "1 vragenlijst") },
    { sleutel: "beoordelingen", vraag: "Hoeveel beoordelingen verwacht je?", keuzes: trappen(aantallen("beoordelingen"), "1 beoordeling") },
    { sleutel: "gebruikers", vraag: "Hoeveel mensen werken ermee?", keuzes: gebruikerKeuzes },
  ];
}

export type Antwoorden = Record<VraagSleutel, Keuze["nodig"]>;

export interface Advies {
  pakket: Pakket;
  /** in gewone woorden waarom dit pakket */
  reden: string;
  /** true: geen pakket met aantallen paste, dus het pakket dat je zelf samenstelt */
  maatwerk: boolean;
}

function past(grens: Grens | null, nodig: Keuze["nodig"]): boolean {
  if (grens === null || nodig === "meer") return false;
  if (grens === "meerdere") return true;
  return nodig !== "meerdere" && nodig <= grens;
}

const WAT: Record<VraagSleutel, string> = { vragenlijsten: "vragenlijsten", beoordelingen: "beoordelingen", gebruikers: "gebruikers" };

/** Zet woorden achter elkaar: "a", "a en b", "a, b en c". */
const opsomming = (delen: string[]) => (delen.length <= 1 ? (delen[0] ?? "") : `${delen.slice(0, -1).join(", ")} en ${delen[delen.length - 1] ?? ""}`);

/**
 * Het pakket dat past bij de drie antwoorden: het eerste pakket (in de volgorde van de prijslijst) waar alle drie
 * de aantallen in passen. Past er geen, dan het pakket op aanvraag (Maatwerk); bestaat dat niet, dan het laatste
 * pakket. Geeft dus altijd een bestaand pakket terug.
 */
export function kiesPakket(a: Antwoorden, pakketten: readonly Pakket[] = PAKKETTEN): Advies {
  const kandidaten = pakketten.map((p) => ({ p, g: grenzenVan(p) })).filter((x) => compleet(x.g));
  const gekozen = kandidaten.find(({ g }) => VRAAG_SLEUTELS.every((s) => past(g[s], a[s])));
  if (gekozen) {
    const inhoud = VRAAG_SLEUTELS.map((s) => gekozen.g.bron[s]?.toLowerCase() ?? "").filter(Boolean);
    return { pakket: gekozen.p, reden: `In het ${gekozen.p.naam} zitten ${opsomming(inhoud)}. Dat is genoeg voor wat je invulde.`, maatwerk: false };
  }
  const maatwerk = pakketten.find((p) => p.prijs === null && !compleet(grenzenVan(p))) ?? pakketten[pakketten.length - 1] ?? PAKKETTEN[PAKKETTEN.length - 1];
  if (!maatwerk) throw new Error("Er zijn geen pakketten.");
  // waar loopt het op vast? Noem wat in geen enkel pakket met aantallen past
  const teVeel = VRAAG_SLEUTELS.filter((s) => !kandidaten.some(({ g }) => past(g[s], a[s]))).map((s) => WAT[s]);
  const namen = opsomming(kandidaten.map(({ p }) => `het ${p.naam}`));
  const reden = !kandidaten.length
    ? `Uit de pakketten is niet af te leiden wat bij deze aantallen past. Het ${maatwerk.naam} stel je zelf samen; neem contact op, dan kijken we mee.`
    : teVeel.length
      ? `Je hebt meer ${opsomming(teVeel)} nodig dan er in ${namen} zitten. Het ${maatwerk.naam} stel je zelf samen, zodat je krijgt wat je nodig hebt.`
      : `Deze combinatie past niet in één van de pakketten met vaste aantallen (${namen}). Het ${maatwerk.naam} stel je zelf samen, zodat je krijgt wat je nodig hebt.`;
  return { pakket: maatwerk, reden, maatwerk: true };
}

/** De pakketten die niet meedoen in de kiezer en ook niet het pakket op aanvraag zijn (zoals het MKB Pakket). */
export function buitenDeKiezer(pakketten: readonly Pakket[] = PAKKETTEN): Pakket[] {
  return pakketten.filter((p) => !compleet(grenzenVan(p)) && p.prijs !== null);
}
