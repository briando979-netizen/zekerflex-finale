// ---------------------------------------------------------------------------
// Het projectmodel van de video-editor (Admin → Video-editor): sporen, clips en
// alle bewerkingen daarop (knippen, bijsnijden, verplaatsen met magneet,
// overgangen). Puur en zonder DOM, zodat de editor, de server (AI-video) en de
// tests hetzelfde model gebruiken. Tijden staan in seconden op de tijdlijn.
// ---------------------------------------------------------------------------

export type Formaat = "9:16" | "16:9" | "1:1" | "4:5";

export const FORMATEN: Record<Formaat, { w: number; h: number; label: string; kort: string }> = {
  "9:16": { w: 1080, h: 1920, label: "Staand (Reels, TikTok, Shorts)", kort: "Staand, Reels" },
  "16:9": { w: 1920, h: 1080, label: "Liggend (YouTube, website)", kort: "Liggend, YouTube" },
  "1:1": { w: 1080, h: 1080, label: "Vierkant", kort: "Vierkant" },
  "4:5": { w: 1080, h: 1350, label: "Instagram-bericht", kort: "Instagram" },
};

export type SpoorSoort = "beeld" | "tekst" | "audio";

export interface Spoor {
  id: string;
  soort: SpoorSoort;
  naam: string;
  verborgen?: boolean;
  stil?: boolean;
  slot?: boolean;
}

export type Overgang = "geen" | "vervagen" | "schuiven" | "zoom" | "wissen" | "draaien";
export type Beweging = "geen" | "inzoomen" | "uitzoomen" | "links" | "rechts" | "omhoog";
export type TekstAnimatie = "geen" | "vervagen" | "opschuiven" | "pop" | "typen" | "stuiteren";
export type TekstStijl = "gewoon" | "kader" | "omlijnd" | "schaduw" | "neon";

export interface Filters {
  helderheid: number; // 100 = normaal
  contrast: number; // 100
  verzadiging: number; // 100
  vervaging: number; // px op 1080p
  zwartwit: number; // 0..100
  sepia: number; // 0..100
  tint: number; // graden, 0 = normaal
}

export const GEEN_FILTER: Filters = { helderheid: 100, contrast: 100, verzadiging: 100, vervaging: 0, zwartwit: 0, sepia: 0, tint: 0 };

export const FILTER_PRESETS: { id: string; label: string; filters: Filters }[] = [
  { id: "geen", label: "Origineel", filters: GEEN_FILTER },
  { id: "levendig", label: "Levendig", filters: { ...GEEN_FILTER, contrast: 112, verzadiging: 135 } },
  { id: "warm", label: "Warm", filters: { ...GEEN_FILTER, sepia: 22, verzadiging: 115, helderheid: 104 } },
  { id: "koel", label: "Koel", filters: { ...GEEN_FILTER, tint: 12, verzadiging: 92, contrast: 106 } },
  { id: "film", label: "Film", filters: { ...GEEN_FILTER, contrast: 118, verzadiging: 82, sepia: 12 } },
  { id: "zwartwit", label: "Zwart-wit", filters: { ...GEEN_FILTER, zwartwit: 100, contrast: 120 } },
  { id: "zacht", label: "Zacht", filters: { ...GEEN_FILTER, helderheid: 108, contrast: 90, verzadiging: 90 } },
  { id: "dromerig", label: "Dromerig", filters: { ...GEEN_FILTER, helderheid: 110, verzadiging: 120, vervaging: 1 } },
];

interface ClipBasis {
  id: string;
  spoor: string;
  start: number;
  duur: number;
}

export interface Plaatsing {
  x: number; // midden, -1..1 (0 = gecentreerd)
  y: number;
  schaal: number; // 1 = vullend
  draai: number; // graden
}

export interface BeeldClip extends ClipBasis {
  soort: "video" | "foto" | "kleur";
  /** Adres van het bronbestand (eigen herkomst) of leeg bij een kleurvlak. */
  bron: string;
  naam: string;
  /** Video: waar in de bron deze clip begint (seconden). */
  inpunt: number;
  /** Video: lengte van de bron; begrenst bijsnijden. null = onbeperkt (foto/kleur). */
  bronDuur: number | null;
  snelheid: number;
  volume: number;
  passen: "vullen" | "passend";
  plaatsing: Plaatsing;
  beweging: Beweging;
  filters: Filters;
  dekking: number; // 0..1
  vervagenIn: number;
  vervagenUit: number;
  /** Overgang vanaf de vorige clip op hetzelfde spoor. */
  overgang: Overgang;
  overgangDuur: number;
  kleur: string;
  /** Tweede kleur voor een verloop (leeg = effen). */
  kleur2: string;
}

export interface TekstClip extends ClipBasis {
  soort: "tekst";
  tekst: string;
  lettertype: string;
  grootte: number; // in procenten van de beeldbreedte ×10 (60 = 6% van de breedte)
  kleur: string;
  achtergrond: string; // leeg = geen
  stijl: TekstStijl;
  vet: boolean;
  uitlijning: "links" | "midden" | "rechts";
  x: number; // 0..1
  y: number; // 0..1
  breedte: number; // max. breedte, 0..1
  animatieIn: TekstAnimatie;
  animatieUit: TekstAnimatie;
  /** Ondertitel: woord voor woord oplichten. */
  karaoke: boolean;
}

export interface AudioClip extends ClipBasis {
  soort: "audio";
  bron: string;
  naam: string;
  inpunt: number;
  bronDuur: number | null;
  snelheid: number;
  volume: number;
  vervagenIn: number;
  vervagenUit: number;
  /** Muziek zachter zetten zodra er een stem klinkt. */
  rol: "muziek" | "stem" | "effect";
}

export type Clip = BeeldClip | TekstClip | AudioClip;

export interface Project {
  id: string;
  naam: string;
  formaat: Formaat;
  fps: number;
  achtergrond: string;
  sporen: Spoor[];
  clips: Clip[];
  bijgewerkt: string;
  versie: 1;
}

export const MIN_DUUR = 0.1;
export const LETTERTYPES = ["Bricolage Grotesque", "Instrument Sans", "Instrument Serif", "IBM Plex Mono", "Georgia", "Impact"] as const;

let teller = 0;
/** Kort, uniek id (niet geheim). */
export function nieuwId(voorvoegsel = "c"): string {
  teller = (teller + 1) % 1_000_000;
  return `${voorvoegsel}${Date.now().toString(36)}${teller.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export const rond = (n: number, op = 1000) => Math.round(n * op) / op;
export const klem = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function leegProject(naam = "Nieuwe video", formaat: Formaat = "9:16"): Project {
  return {
    id: nieuwId("p"),
    naam,
    formaat,
    fps: 30,
    achtergrond: "#000000",
    sporen: [
      { id: "s-beeld", soort: "beeld", naam: "Hoofdspoor" },
      { id: "s-overlay", soort: "beeld", naam: "Overlay" },
      { id: "s-tekst", soort: "tekst", naam: "Tekst" },
      { id: "s-onder", soort: "tekst", naam: "Ondertiteling" },
      { id: "s-stem", soort: "audio", naam: "Stem" },
      { id: "s-muziek", soort: "audio", naam: "Muziek" },
    ],
    clips: [],
    bijgewerkt: new Date().toISOString(),
    versie: 1,
  };
}

export function nieuweBeeldClip(deel: Partial<BeeldClip> & Pick<BeeldClip, "spoor" | "start" | "duur" | "soort">): BeeldClip {
  return {
    id: nieuwId(),
    bron: "",
    naam: deel.soort === "kleur" ? "Kleurvlak" : "Clip",
    inpunt: 0,
    bronDuur: null,
    snelheid: 1,
    volume: 1,
    passen: "vullen",
    plaatsing: { x: 0, y: 0, schaal: 1, draai: 0 },
    beweging: deel.soort === "foto" ? "inzoomen" : "geen",
    filters: { ...GEEN_FILTER },
    dekking: 1,
    vervagenIn: 0,
    vervagenUit: 0,
    overgang: "geen",
    overgangDuur: 0.5,
    kleur: "#0E5C4A",
    kleur2: "",
    ...deel,
  };
}

export function nieuweTekstClip(deel: Partial<TekstClip> & Pick<TekstClip, "spoor" | "start" | "duur">): TekstClip {
  return {
    id: nieuwId(),
    soort: "tekst",
    tekst: "Jouw tekst",
    lettertype: "Bricolage Grotesque",
    grootte: 70,
    kleur: "#FFFFFF",
    achtergrond: "",
    stijl: "schaduw",
    vet: true,
    uitlijning: "midden",
    x: 0.5,
    y: 0.5,
    breedte: 0.86,
    animatieIn: "pop",
    animatieUit: "vervagen",
    karaoke: false,
    ...deel,
  };
}

export function nieuweAudioClip(deel: Partial<AudioClip> & Pick<AudioClip, "spoor" | "start" | "duur" | "bron">): AudioClip {
  return {
    id: nieuwId(),
    soort: "audio",
    naam: "Audio",
    inpunt: 0,
    bronDuur: null,
    snelheid: 1,
    volume: 1,
    vervagenIn: 0,
    vervagenUit: 0,
    rol: "muziek",
    ...deel,
  };
}

export const einde = (c: { start: number; duur: number }) => c.start + c.duur;

/** Lengte van het hele project (minstens 1 seconde). */
export function projectDuur(p: Pick<Project, "clips">): number {
  return Math.max(1, ...p.clips.map(einde));
}

export function clipsOpSpoor(p: Pick<Project, "clips">, spoor: string): Clip[] {
  return p.clips.filter((c) => c.spoor === spoor).sort((a, b) => a.start - b.start);
}

/** De clip die op tijdstip t op een spoor speelt. */
export function clipOp(p: Pick<Project, "clips">, spoor: string, t: number): Clip | undefined {
  return p.clips.find((c) => c.spoor === spoor && t >= c.start && t < einde(c));
}

/** Waar in de bron een clip zit op tijdstip t van de tijdlijn. */
export function bronTijd(c: BeeldClip | AudioClip, t: number): number {
  return c.inpunt + Math.max(0, t - c.start) * c.snelheid;
}

/** Hoe lang een clip mag zijn met het huidige inpunt (bron is eindig bij video/audio). */
export function maxDuur(c: Clip): number {
  if (c.soort === "tekst" || c.soort === "foto" || c.soort === "kleur") return 3600;
  if (c.bronDuur === null) return 3600;
  return Math.max(MIN_DUUR, (c.bronDuur - c.inpunt) / c.snelheid);
}

/** Knip een clip op tijdstip t in twee. Geeft null als t niet binnen de clip valt. */
export function knip(c: Clip, t: number): [Clip, Clip] | null {
  if (t <= c.start + MIN_DUUR / 2 || t >= einde(c) - MIN_DUUR / 2) return null;
  const links = rond(t - c.start);
  const a = { ...c, duur: links } as Clip;
  const b = { ...c, id: nieuwId(), start: rond(t), duur: rond(c.duur - links) } as Clip;
  if (b.soort === "video" || b.soort === "audio") b.inpunt = rond(c.soort === "video" || c.soort === "audio" ? c.inpunt + links * c.snelheid : 0);
  // Een vervaging hoort bij de echte randen, niet bij de knip.
  if (a.soort !== "tekst") a.vervagenUit = 0;
  if (b.soort !== "tekst") b.vervagenIn = 0;
  if (b.soort !== "tekst" && b.soort !== "audio") b.overgang = "geen";
  return [a, b];
}

/** Begin van een clip verschuiven (linkerrand slepen). */
export function snijBegin(c: Clip, nieuwStart: number): Clip {
  const eindT = einde(c);
  let start = klem(nieuwStart, 0, eindT - MIN_DUUR);
  if (c.soort === "video" || c.soort === "audio") {
    // Niet verder terug dan het begin van de bron.
    start = Math.max(start, c.start - c.inpunt / c.snelheid);
    const inpunt = rond(Math.max(0, c.inpunt + (start - c.start) * c.snelheid));
    return { ...c, start: rond(start), duur: rond(eindT - start), inpunt };
  }
  return { ...c, start: rond(start), duur: rond(eindT - start) };
}

/** Einde van een clip verschuiven (rechterrand slepen). */
export function snijEinde(c: Clip, nieuwEinde: number): Clip {
  const duur = klem(nieuwEinde - c.start, MIN_DUUR, maxDuur(c));
  return { ...c, duur: rond(duur) };
}

/** Snelheid veranderen houdt hetzelfde stuk bron: de clip wordt korter of langer. */
export function zetSnelheid(c: BeeldClip | AudioClip, snelheid: number): BeeldClip | AudioClip {
  const s = klem(snelheid, 0.25, 4);
  const bronStuk = c.duur * c.snelheid;
  return { ...c, snelheid: s, duur: rond(Math.max(MIN_DUUR, bronStuk / s)) };
}

/** Magneet: het dichtstbijzijnde randpunt binnen de drempel, anders t zelf. */
export function magneet(t: number, punten: number[], drempel: number): number {
  let beste = t;
  let afstand = drempel;
  for (const p of punten) {
    const d = Math.abs(p - t);
    if (d < afstand) {
      afstand = d;
      beste = p;
    }
  }
  return beste;
}

/** Alle randen waar een clip naartoe mag klikken (behalve de clip zelf). */
export function magneetPunten(p: Pick<Project, "clips">, behalve: string, kop: number): number[] {
  const punten = [0, kop];
  for (const c of p.clips) {
    if (c.id === behalve) continue;
    punten.push(c.start, einde(c));
  }
  return punten;
}

/**
 * Een vrije plek op een spoor zo dicht mogelijk bij de gewenste start, zodat
 * clips op één spoor nooit over elkaar heen liggen.
 */
export function vrijePlek(p: Pick<Project, "clips">, spoor: string, duur: number, gewenst: number, behalve?: string): number {
  const anderen = p.clips.filter((c) => c.spoor === spoor && c.id !== behalve).sort((a, b) => a.start - b.start);
  const past = (s: number) => s >= 0 && anderen.every((c) => s + duur <= c.start + 1e-6 || s >= einde(c) - 1e-6);
  const start = Math.max(0, gewenst);
  if (past(start)) return rond(start);
  const kandidaten = [0, ...anderen.map(einde), ...anderen.map((c) => c.start - duur)].filter((s) => s >= 0 && past(s));
  if (!kandidaten.length) return rond(Math.max(0, ...anderen.map(einde)));
  return rond(kandidaten.reduce((a, b) => (Math.abs(b - start) < Math.abs(a - start) ? b : a)));
}

/** Het einde van de laatste clip op een spoor (om iets achteraan te zetten). */
export function spoorEinde(p: Pick<Project, "clips">, spoor: string): number {
  return Math.max(0, ...p.clips.filter((c) => c.spoor === spoor).map(einde));
}

/** Gat dichten: alle clips op dit spoor na `vanaf` schuiven `delta` naar links. */
export function schuifNa(p: Project, spoor: string, vanaf: number, delta: number): Project {
  return {
    ...p,
    clips: p.clips.map((c) => (c.spoor === spoor && c.start >= vanaf - 1e-6 ? { ...c, start: rond(Math.max(0, c.start - delta)) } : c)),
  };
}

/** Verwijder een clip; op het hoofdspoor schuift de rest aan (zoals CapCut). */
export function verwijderClip(p: Project, id: string, aansluiten: boolean): Project {
  const c = p.clips.find((x) => x.id === id);
  if (!c) return p;
  const zonder = { ...p, clips: p.clips.filter((x) => x.id !== id) };
  return aansluiten ? schuifNa(zonder, c.spoor, einde(c), c.duur) : zonder;
}

export function vervangClip(p: Project, clip: Clip): Project {
  return { ...p, clips: p.clips.map((c) => (c.id === clip.id ? clip : c)) };
}

/** Kopie direct achter de clip (of op de eerstvolgende vrije plek). */
export function dupliceer(p: Project, id: string): { project: Project; kopie: Clip | null } {
  const c = p.clips.find((x) => x.id === id);
  if (!c) return { project: p, kopie: null };
  const start = vrijePlek(p, c.spoor, c.duur, einde(c));
  const kopie = { ...c, id: nieuwId(), start } as Clip;
  return { project: { ...p, clips: [...p.clips, kopie] }, kopie };
}

// ---- Weergave-hulpjes (gedeeld door de tekenaar en de tests) -----------------

/** Hoe zichtbaar een clip is door in- en uitvagen (0..1). */
export function vervaagFactor(c: { start: number; duur: number; vervagenIn: number; vervagenUit: number }, t: number): number {
  const sinds = t - c.start;
  const tot = einde(c) - t;
  let f = 1;
  if (c.vervagenIn > 0) f = Math.min(f, klem(sinds / c.vervagenIn, 0, 1));
  if (c.vervagenUit > 0) f = Math.min(f, klem(tot / c.vervagenUit, 0, 1));
  return f;
}

export const zacht = (x: number) => x * x * (3 - 2 * x);
const uitTerug = (x: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

/** Ken Burns: extra schaal en verschuiving voor een bewegende foto, p = 0..1 door de clip. */
export function bewegingOp(b: Beweging, p: number): { schaal: number; dx: number; dy: number } {
  const v = zacht(klem(p, 0, 1));
  switch (b) {
    case "inzoomen":
      return { schaal: 1 + 0.14 * v, dx: 0, dy: 0 };
    case "uitzoomen":
      return { schaal: 1.14 - 0.14 * v, dx: 0, dy: 0 };
    case "links":
      return { schaal: 1.12, dx: 0.05 - 0.1 * v, dy: 0 };
    case "rechts":
      return { schaal: 1.12, dx: -0.05 + 0.1 * v, dy: 0 };
    case "omhoog":
      return { schaal: 1.12, dx: 0, dy: 0.05 - 0.1 * v };
    default:
      return { schaal: 1, dx: 0, dy: 0 };
  }
}

/** Tekst-animatie op tijdstip t: dekking, schaal, verschuiving (fractie hoogte) en hoeveel tekens. */
export function tekstAnimatie(c: TekstClip, t: number): { dekking: number; schaal: number; dy: number; tekens: number } {
  const IN = Math.min(0.45, c.duur / 3);
  const UIT = Math.min(0.35, c.duur / 3);
  const sinds = t - c.start;
  const tot = einde(c) - t;
  let dekking = 1;
  let schaal = 1;
  let dy = 0;
  let tekens = c.tekst.length;
  const pi = klem(sinds / IN, 0, 1);
  const pu = klem(tot / UIT, 0, 1);
  switch (c.animatieIn) {
    case "vervagen":
      dekking *= zacht(pi);
      break;
    case "opschuiven":
      dekking *= zacht(pi);
      dy += (1 - zacht(pi)) * 0.04;
      break;
    case "pop":
      dekking *= klem(pi * 2, 0, 1);
      schaal *= 0.6 + 0.4 * uitTerug(pi);
      break;
    case "stuiteren":
      dekking *= klem(pi * 3, 0, 1);
      dy -= Math.abs(Math.sin(pi * Math.PI * 2)) * (1 - pi) * 0.05;
      break;
    case "typen": {
      const typT = Math.min(c.duur * 0.6, c.tekst.length * 0.045);
      tekens = Math.round(c.tekst.length * klem(typT > 0 ? sinds / typT : 1, 0, 1));
      break;
    }
    default:
      break;
  }
  switch (c.animatieUit) {
    case "vervagen":
      dekking *= zacht(pu);
      break;
    case "opschuiven":
      dekking *= zacht(pu);
      dy -= (1 - zacht(pu)) * 0.04;
      break;
    case "pop":
      dekking *= zacht(pu);
      schaal *= 0.8 + 0.2 * zacht(pu);
      break;
    default:
      break;
  }
  return { dekking, schaal, dy, tekens };
}

/** CSS/canvas-filter voor een clip; leeg als er niets aan staat. */
export function filterTekst(f: Filters, schaalPx = 1): string {
  const delen: string[] = [];
  if (f.helderheid !== 100) delen.push(`brightness(${f.helderheid}%)`);
  if (f.contrast !== 100) delen.push(`contrast(${f.contrast}%)`);
  if (f.verzadiging !== 100) delen.push(`saturate(${f.verzadiging}%)`);
  if (f.zwartwit > 0) delen.push(`grayscale(${f.zwartwit}%)`);
  if (f.sepia > 0) delen.push(`sepia(${f.sepia}%)`);
  if (f.tint !== 0) delen.push(`hue-rotate(${f.tint}deg)`);
  if (f.vervaging > 0) delen.push(`blur(${rond(f.vervaging * schaalPx, 10)}px)`);
  return delen.join(" ");
}

/** Hoe hard muziek klinkt op tijdstip t: zachter (ducking) zolang er een stem speelt. */
export function muziekDemping(p: Pick<Project, "clips" | "sporen">, t: number): number {
  const stilleSporen = new Set(p.sporen.filter((s) => s.stil).map((s) => s.id));
  const stem = p.clips.some((c) => c.soort === "audio" && c.rol === "stem" && !stilleSporen.has(c.spoor) && t >= c.start - 0.2 && t < einde(c) + 0.2);
  return stem ? 0.28 : 1;
}

// ---- Ondertiteling -------------------------------------------------------------

/** Verdeel een tekst in korte ondertitels (max. `woorden` per regel), getimed over [start, start+duur]. */
export function ondertitels(tekst: string, start: number, duur: number, woorden = 5): { tekst: string; start: number; duur: number }[] {
  const zinnen = tekst
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
  const stukken: string[] = [];
  for (const zin of zinnen) {
    const w = zin.split(" ");
    const n = Math.ceil(w.length / woorden);
    const per = Math.ceil(w.length / n);
    for (let i = 0; i < w.length; i += per) stukken.push(w.slice(i, i + per).join(" "));
  }
  if (!stukken.length) return [];
  // Tijd naar verhouding van het aantal tekens (lange woorden duren langer).
  const gewicht = stukken.map((s) => s.length + 4);
  const totaal = gewicht.reduce((a, b) => a + b, 0);
  let t = start;
  return stukken.map((s, i) => {
    const d = (duur * (gewicht[i] ?? 0)) / totaal;
    const uit = { tekst: s, start: rond(t), duur: rond(d) };
    t += d;
    return uit;
  });
}

// ---- Controle van een project dat van buiten komt (opslaan, AI) ----------------

const KLEUR = /^#[0-9a-f]{6}$/i;
const veiligeBron = (b: unknown) => typeof b === "string" && b.length < 600 && (b === "" || /^\/(?!\/)[\w\-./?=&%]*$/.test(b));
const getal = (v: unknown, min: number, max: number, std: number) => (typeof v === "number" && Number.isFinite(v) ? klem(v, min, max) : std);
const tekst = (v: unknown, max: number, std = "") => (typeof v === "string" ? v.slice(0, max) : std);
function uitLijst<T extends string>(v: unknown, lijst: readonly T[], std: T): T {
  return typeof v === "string" && (lijst as readonly string[]).includes(v) ? (v as T) : std;
}

const OVERGANGEN: readonly Overgang[] = ["geen", "vervagen", "schuiven", "zoom", "wissen", "draaien"];
const BEWEGINGEN: readonly Beweging[] = ["geen", "inzoomen", "uitzoomen", "links", "rechts", "omhoog"];
const ANIMATIES: readonly TekstAnimatie[] = ["geen", "vervagen", "opschuiven", "pop", "typen", "stuiteren"];
const STIJLEN: readonly TekstStijl[] = ["gewoon", "kader", "omlijnd", "schaduw", "neon"];

/**
 * Maak van willekeurige JSON een geldig project: onbekende velden weg, getallen
 * begrensd, bronnen alleen van onze eigen herkomst (een pad dat met / begint).
 * Gooit bij iets dat helemaal geen project is.
 */
export function schoonProject(ruw: unknown): Project {
  const r = (ruw ?? {}) as Record<string, unknown>;
  if (!Array.isArray(r.sporen) || !Array.isArray(r.clips)) throw new Error("Dit is geen videoproject.");
  const sporen: Spoor[] = (r.sporen as Record<string, unknown>[]).slice(0, 30).map((s, i) => ({
    id: /^[\w-]{1,40}$/.test(String(s.id)) ? String(s.id) : `s${i}`,
    soort: uitLijst(s.soort, ["beeld", "tekst", "audio"] as const, "beeld"),
    naam: tekst(s.naam, 40, "Spoor"),
    ...(s.verborgen === true ? { verborgen: true } : {}),
    ...(s.stil === true ? { stil: true } : {}),
    ...(s.slot === true ? { slot: true } : {}),
  }));
  const spoorSoort = new Map(sporen.map((s) => [s.id, s.soort]));
  const clips: Clip[] = [];
  for (const c of (r.clips as Record<string, unknown>[]).slice(0, 2000)) {
    const spoor = String(c.spoor);
    const soortSpoor = spoorSoort.get(spoor);
    if (!soortSpoor) continue;
    const basis = {
      id: /^[\w-]{1,40}$/.test(String(c.id)) ? String(c.id) : nieuwId(),
      spoor,
      start: rond(getal(c.start, 0, 3600, 0)),
      duur: rond(getal(c.duur, MIN_DUUR, 3600, 3)),
    };
    if (soortSpoor === "tekst" && c.soort === "tekst") {
      clips.push({
        ...basis,
        soort: "tekst",
        tekst: tekst(c.tekst, 400, "Tekst"),
        lettertype: uitLijst(c.lettertype, LETTERTYPES, "Bricolage Grotesque"),
        grootte: getal(c.grootte, 10, 300, 70),
        kleur: KLEUR.test(String(c.kleur)) ? String(c.kleur) : "#FFFFFF",
        achtergrond: KLEUR.test(String(c.achtergrond)) ? String(c.achtergrond) : "",
        stijl: uitLijst(c.stijl, STIJLEN, "schaduw"),
        vet: c.vet !== false,
        uitlijning: uitLijst(c.uitlijning, ["links", "midden", "rechts"] as const, "midden"),
        x: getal(c.x, 0, 1, 0.5),
        y: getal(c.y, 0, 1, 0.5),
        breedte: getal(c.breedte, 0.1, 1, 0.86),
        animatieIn: uitLijst(c.animatieIn, ANIMATIES, "pop"),
        animatieUit: uitLijst(c.animatieUit, ANIMATIES, "vervagen"),
        karaoke: c.karaoke === true,
      });
    } else if (soortSpoor === "audio" && c.soort === "audio" && veiligeBron(c.bron) && c.bron) {
      clips.push({
        ...basis,
        soort: "audio",
        bron: String(c.bron),
        naam: tekst(c.naam, 80, "Audio"),
        inpunt: getal(c.inpunt, 0, 36000, 0),
        bronDuur: typeof c.bronDuur === "number" ? getal(c.bronDuur, 0, 36000, 0) : null,
        snelheid: getal(c.snelheid, 0.25, 4, 1),
        volume: getal(c.volume, 0, 2, 1),
        vervagenIn: getal(c.vervagenIn, 0, 30, 0),
        vervagenUit: getal(c.vervagenUit, 0, 30, 0),
        rol: uitLijst(c.rol, ["muziek", "stem", "effect"] as const, "muziek"),
      });
    } else if (soortSpoor === "beeld" && (c.soort === "video" || c.soort === "foto" || c.soort === "kleur") && veiligeBron(c.bron)) {
      const f = (c.filters ?? {}) as Record<string, unknown>;
      const pl = (c.plaatsing ?? {}) as Record<string, unknown>;
      clips.push({
        ...basis,
        soort: c.soort,
        bron: String(c.bron ?? ""),
        naam: tekst(c.naam, 80, "Clip"),
        inpunt: getal(c.inpunt, 0, 36000, 0),
        bronDuur: typeof c.bronDuur === "number" ? getal(c.bronDuur, 0, 36000, 0) : null,
        snelheid: getal(c.snelheid, 0.25, 4, 1),
        volume: getal(c.volume, 0, 2, 1),
        passen: uitLijst(c.passen, ["vullen", "passend"] as const, "vullen"),
        plaatsing: { x: getal(pl.x, -2, 2, 0), y: getal(pl.y, -2, 2, 0), schaal: getal(pl.schaal, 0.05, 5, 1), draai: getal(pl.draai, -360, 360, 0) },
        beweging: uitLijst(c.beweging, BEWEGINGEN, "geen"),
        filters: {
          helderheid: getal(f.helderheid, 0, 300, 100),
          contrast: getal(f.contrast, 0, 300, 100),
          verzadiging: getal(f.verzadiging, 0, 300, 100),
          vervaging: getal(f.vervaging, 0, 40, 0),
          zwartwit: getal(f.zwartwit, 0, 100, 0),
          sepia: getal(f.sepia, 0, 100, 0),
          tint: getal(f.tint, -180, 180, 0),
        },
        dekking: getal(c.dekking, 0, 1, 1),
        vervagenIn: getal(c.vervagenIn, 0, 30, 0),
        vervagenUit: getal(c.vervagenUit, 0, 30, 0),
        overgang: uitLijst(c.overgang, OVERGANGEN, "geen"),
        overgangDuur: getal(c.overgangDuur, 0.1, 3, 0.5),
        kleur: KLEUR.test(String(c.kleur)) ? String(c.kleur) : "#0E5C4A",
        kleur2: KLEUR.test(String(c.kleur2)) ? String(c.kleur2) : "",
      });
    }
  }
  return {
    id: /^p[\w]{4,40}$/.test(String(r.id)) ? String(r.id) : nieuwId("p"),
    naam: tekst(r.naam, 80, "Video") || "Video",
    formaat: uitLijst(r.formaat, ["9:16", "16:9", "1:1", "4:5"] as const, "9:16"),
    fps: 30,
    achtergrond: KLEUR.test(String(r.achtergrond)) ? String(r.achtergrond) : "#000000",
    sporen,
    clips,
    bijgewerkt: new Date().toISOString(),
    versie: 1,
  };
}
