import { createHash } from "node:crypto";
import { JURIDISCH_REGEL, MAX_LOAD_START, MAX_LOAD_STOP, STEEKPROEF_AANTAL, STEEKPROEF_DREMPEL, TAAL_META, type TaalCode } from "@/lib/i18n/config";

// ---------------------------------------------------------------------------
// Talen-motor, de pure kern (13 nov 2026, poortwachter 86). Het script scripts/talen-motor.mjs gebruikt dit bestand;
// het draait NIET in de app (alleen tests importeren het buiten het script) en doet zelf geen netwerk of bestandswerk:
// de vertaler, de terugvertaler en de rechter komen van buiten (het script geeft ze de LLM-adapter, lib/ai/client.ts).
//
// Wat het doet: uit het Nederlandse woordenboek (`nl` in lib/i18n/freelancer.ts) alle teksten ("bladeren") halen,
// juridische teksten overslaan, de rest in batches laten vertalen, per tekst controleren dat dezelfde plaatshouders
// ({naam}) er nog in staan, en wat mislukt weglaten (de lader vult dat aan met het Engels). Het resultaat is een
// bestand per taal, lib/i18n/gen/freelancer.<taal>.ts, dat nooit met de hand wordt aangepast: verbeteringen staan in
// lib/i18n/overrides/<taal>.ts. Alleen UI-teksten gaan het model in, nooit persoonsgegevens.
//
// Functies in het woordenboek (`hours: (n) => …`) worden niet vertaald: die vallen terug op het Engels. Enkelvoud en
// meervoud zijn aparte sleutels (reviewEen/reviewMeer) of een {een, meer}-paar: elk blad houdt zijn eigen plaatshouders.
// ---------------------------------------------------------------------------

export type Pad = readonly (string | number)[];
export interface Blad {
  pad: Pad;
  bron: string;
}

/** Eenvoudige diepe-deels-vorm: een gegenereerd bestand of override hoeft niet elke sleutel te hebben. */
export type DiepDeels<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly unknown[]
    ? T
    : T extends object
      ? { [K in keyof T]?: DiepDeels<T[K]> }
      : T;

export const padSleutel = (pad: Pad): string => pad.map(String).join(".");

/** Alle tekstbladeren van een woordenboek, in vaste volgorde. Functies en getallen worden overgeslagen. */
export function bladeren(dict: unknown, pad: Pad = []): Blad[] {
  if (typeof dict === "string") return [{ pad, bron: dict }];
  if (Array.isArray(dict)) return dict.flatMap((v, i) => bladeren(v, [...pad, i]));
  if (dict !== null && typeof dict === "object") {
    return Object.entries(dict as Record<string, unknown>).flatMap(([k, v]) => bladeren(v, [...pad, k]));
  }
  return [];
}

/** Bovenste sleutels met juridische tekst: uitzendovereenkomst, loonstrooktoelichting, BSN/ID-uitleg, fiscale gegevens. */
export const JURIDISCHE_TOPSLEUTELS: readonly string[] = ["uitzendContract", "uitzendPanel", "loonstrook", "wie", "fiscaalForm"];
const JURIDISCH_PADDEEL = /voorwaarden|privacy|overeenkomst|bsn|loonstrook|juridisch/i;
const JURIDISCH_TEKST = /\b(BSN|AVG|GDPR|algemene voorwaarden|privacyverklaring|uitzendovereenkomst)\b/i;

/** Juridisch of identiteitsgebonden: niet machinaal vertalen, valt terug op Engels (met JURIDISCH_REGEL). */
export function isJuridisch(pad: Pad, bron: string): boolean {
  const top = pad[0];
  if (typeof top === "string" && JURIDISCHE_TOPSLEUTELS.includes(top)) return true;
  if (pad.some((p) => typeof p === "string" && JURIDISCH_PADDEEL.test(p))) return true;
  return JURIDISCH_TEKST.test(bron);
}

/** Heeft de tekst iets te vertalen (een letter buiten de plaatshouders)? "★", "{n}" en "12:30" niet. */
export function moetVertaald(bron: string): boolean {
  return /\p{L}/u.test(bron.replace(/\{\w+\}/gu, ""));
}

export function plaatshouders(tekst: string): string[] {
  return [...tekst.matchAll(/\{(\w+)\}/gu)].map((m) => m[1] ?? "").sort();
}

/** Zelfde plaatshouders (ook hetzelfde aantal) in bron en vertaling? */
export function plaatshoudersKlopt(bron: string, vertaling: string): boolean {
  const a = plaatshouders(bron);
  const b = plaatshouders(vertaling);
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/** Een vertaling is bruikbaar als ze iets zegt, de plaatshouders en de merknaam behoudt en niet uit de bocht vliegt. */
export function vertalingOk(bron: string, vertaling: unknown): vertaling is string {
  if (typeof vertaling !== "string") return false;
  const v = vertaling.trim();
  if (!v) return false;
  if (!plaatshoudersKlopt(bron, v)) return false;
  if (/ZekerFlex/.test(bron) && !/ZekerFlex/.test(v)) return false;
  if (/[{}]/u.test(v.replace(/\{\w+\}/gu, ""))) return false; // een los accolade: het model heeft JSON gelekt
  if (v.length > Math.max(40, bron.length * 5)) return false;
  return true;
}

/** Splitst bladeren in groepjes van hoogstens `max` teksten en `maxTekens` tekens, zodat één verzoek klein blijft. */
export function maakBatches<T extends { bron: string }>(items: readonly T[], max = 20, maxTekens = 2500): T[][] {
  const uit: T[][] = [];
  let nu: T[] = [];
  let tekens = 0;
  for (const it of items) {
    if (nu.length > 0 && (nu.length >= max || tekens + it.bron.length > maxTekens)) {
      uit.push(nu);
      nu = [];
      tekens = 0;
    }
    nu.push(it);
    tekens += it.bron.length;
  }
  if (nu.length > 0) uit.push(nu);
  return uit;
}

export interface Opdracht {
  system: string;
  user: string;
}

/** De opdracht voor een batch: NL -> doeltaal, als JSON met dezelfde sleutels. */
export function vertaalOpdracht(doel: TaalCode, items: Record<string, string>, van: TaalCode = "nl"): Opdracht {
  const naar = TAAL_META[doel].engels;
  const vanaf = TAAL_META[van].engels;
  return {
    system: [
      `You translate short user-interface texts of a staffing app for flex workers from ${vanaf} to ${naar}.`,
      "Reply with ONE JSON object with exactly the same keys as the input and the translated texts as values. No other text.",
      "Keep every placeholder in curly braces ({name}, {n}, {amount}) exactly as written, never translate or remove them.",
      "Keep the brand name ZekerFlex, numbers, emoji and symbols. Keep it short, natural and informal (address the reader as a friendly worker).",
      "Do not add explanations. Do not translate legal terms by guessing: translate the plain meaning.",
    ].join("\n"),
    user: JSON.stringify(items),
  };
}

/** Terugvertalen van een vertaling naar het Nederlands (voor de steekproef). */
export function terugOpdracht(doel: TaalCode, items: Record<string, string>): Opdracht {
  return vertaalOpdracht("nl", items, doel);
}

export type Vertaler = (opdracht: Opdracht) => Promise<Record<string, unknown>>;
/** Beoordeelt paren (origineel NL, terugvertaald NL): zeggen ze hetzelfde? Eén antwoord per paar. */
export type Rechter = (paren: { bron: string; terug: string }[]) => Promise<boolean[]>;

export interface VertaalUitslag {
  /** sleutel (padSleutel) -> vertaling, alleen wat de controle doorstond */
  gelukt: Map<string, string>;
  mislukt: string[];
}

/**
 * Vertaalt de bladeren batch voor batch, één verzoek tegelijk (nooit parallel). Wat de controle niet haalt, krijgt één
 * tweede poging alleen; lukt dat niet, dan blijft de sleutel weg en valt hij terug op het Engels.
 * `voorVerzoek` mag een belemmering gooien (load te hoog): dat stopt de hele ronde en geeft het deelresultaat terug.
 */
export async function vertaalBladeren(opts: {
  bladeren: readonly Blad[];
  doel: TaalCode;
  vertaler: Vertaler;
  voorVerzoek?: () => Promise<void>;
  voortgang?: (klaar: number, totaal: number) => void;
}): Promise<VertaalUitslag & { gestopt: string | null }> {
  const gelukt = new Map<string, string>();
  const mislukt: string[] = [];
  const todo = opts.bladeren.filter((b) => !isJuridisch(b.pad, b.bron) && moetVertaald(b.bron));
  const batches = maakBatches(todo.map((b) => ({ ...b, sleutel: padSleutel(b.pad) })));
  let klaar = 0;
  let gestopt: string | null = null;
  try {
    for (const batch of batches) {
      const vraag = async (groep: typeof batch): Promise<Record<string, unknown>> => {
        await opts.voorVerzoek?.();
        const items: Record<string, string> = {};
        groep.forEach((b, i) => {
          items[String(i + 1)] = b.bron;
        });
        return opts.vertaler(vertaalOpdracht(opts.doel, items));
      };
      const antwoord = await vraag(batch);
      const opnieuw: typeof batch = [];
      batch.forEach((b, i) => {
        const v = antwoord[String(i + 1)];
        if (vertalingOk(b.bron, v)) gelukt.set(b.sleutel, v.trim());
        else opnieuw.push(b);
      });
      for (const b of opnieuw) {
        const a = await vraag([b]);
        const v = a["1"];
        if (vertalingOk(b.bron, v)) gelukt.set(b.sleutel, v.trim());
        else mislukt.push(b.sleutel);
      }
      klaar += batch.length;
      opts.voortgang?.(klaar, todo.length);
    }
  } catch (err) {
    gestopt = err instanceof Error ? err.message : String(err);
  }
  return { gelukt, mislukt, gestopt };
}

/** Een eenvoudige, vaste trekking: Fisher-Yates met een meegegeven toevalsfunctie (in tests vast). */
export function trekSteekproef<T>(items: readonly T[], n: number = STEEKPROEF_AANTAL, toeval: () => number = Math.random): T[] {
  const kopie = [...items];
  for (let i = kopie.length - 1; i > 0; i--) {
    const j = Math.floor(toeval() * (i + 1));
    const a = kopie[i] as T;
    kopie[i] = kopie[j] as T;
    kopie[j] = a;
  }
  return kopie.slice(0, Math.min(n, kopie.length));
}

const STOPWOORDEN = new Set(["de", "het", "een", "en", "van", "je", "jij", "u", "in", "op", "te", "is", "dat", "die", "dit", "voor", "met", "om", "aan", "naar", "als", "of", "er", "bij", "ook", "nog", "dan"]);
const woorden = (s: string): Set<string> =>
  new Set(
    s
      .toLowerCase()
      .replace(/\{\w+\}/gu, " ")
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 1 && !STOPWOORDEN.has(w)),
  );

/** Reservebeoordeling zonder model: genoeg woorden gelijk (Jaccard >= 0,35, een terugvertaling is nooit woordelijk gelijk). */
export function lijktOpElkaar(a: string, b: string): boolean {
  const x = woorden(a);
  const y = woorden(b);
  if (x.size === 0 || y.size === 0) return x.size === y.size;
  let gelijk = 0;
  for (const w of x) if (y.has(w)) gelijk++;
  return gelijk / (x.size + y.size - gelijk) >= 0.35;
}

export interface SteekproefUitslag {
  gekozen: number;
  klopt: number;
  percentage: number;
  voldoende: boolean;
  /** de afgekeurde paren, om te kijken (alleen UI-tekst) */
  afgekeurd: { sleutel: string; bron: string; terug: string }[];
}

/**
 * Steekproef per taal: `STEEKPROEF_AANTAL` willekeurige vertaalde zinnen terugvertalen naar NL en vergelijken met het
 * origineel. Het percentage dat klopt gaat in het gegenereerde bestand en in het rapport; onder STEEKPROEF_DREMPEL mag de
 * taal niet in MACHINE_LOCALES. De rechter (model) mag falen: dan beslist `lijktOpElkaar`.
 */
export async function steekproef(opts: {
  bron: ReadonlyMap<string, string>;
  vertaald: ReadonlyMap<string, string>;
  doel: TaalCode;
  terugvertaler: Vertaler;
  rechter?: Rechter;
  toeval?: () => number;
  aantal?: number;
}): Promise<SteekproefUitslag> {
  const sleutels = [...opts.vertaald.keys()].filter((k) => opts.bron.has(k));
  const gekozen = trekSteekproef(sleutels, opts.aantal ?? STEEKPROEF_AANTAL, opts.toeval);
  if (gekozen.length === 0) return { gekozen: 0, klopt: 0, percentage: 0, voldoende: false, afgekeurd: [] };
  const items: Record<string, string> = {};
  gekozen.forEach((k, i) => {
    items[String(i + 1)] = opts.vertaald.get(k) ?? "";
  });
  const terug = await opts.terugvertaler(terugOpdracht(opts.doel, items));
  const paren = gekozen.map((k, i) => ({ sleutel: k, bron: opts.bron.get(k) ?? "", terug: typeof terug[String(i + 1)] === "string" ? String(terug[String(i + 1)]) : "" }));
  let oordeel: boolean[] | null = null;
  if (opts.rechter) {
    try {
      const o = await opts.rechter(paren.map(({ bron, terug: t }) => ({ bron, terug: t })));
      if (o.length === paren.length) oordeel = o;
    } catch {
      oordeel = null;
    }
  }
  const goed = paren.map((p, i) => (p.terug !== "" && (oordeel ? oordeel[i] === true : lijktOpElkaar(p.bron, p.terug))));
  const klopt = goed.filter(Boolean).length;
  const percentage = Math.round((klopt / paren.length) * 100);
  return {
    gekozen: paren.length,
    klopt,
    percentage,
    voldoende: percentage >= STEEKPROEF_DREMPEL,
    afgekeurd: paren.filter((_, i) => !goed[i]).map(({ sleutel, bron, terug: t }) => ({ sleutel, bron, terug: t })),
  };
}

// --- bewaking van de server: load en geheugen --------------------------------------------------------------------

export type LoadBesluit = "door" | "wacht" | "stop";

/** load < 3: doorgaan; 3 t/m 6: even wachten; > 6: stoppen. */
export function loadBesluit(load: number): LoadBesluit {
  if (load > MAX_LOAD_STOP) return "stop";
  if (load >= MAX_LOAD_START) return "wacht";
  return "door";
}

/** Een fout die op te weinig geheugen wijst (de eigen server heeft OOM-risico): meteen stoppen, niet herhalen. */
export function isOomFout(fout: unknown): boolean {
  const t = fout instanceof Error ? `${fout.name} ${fout.message}` : String(fout);
  return /out of memory|\boom\b|cannot allocate|killed|llama runner process has terminated|model requires more system memory/i.test(t);
}

// --- het gegenereerde bestand ---------------------------------------------------------------------------------------

export interface GenMeta {
  taal: string;
  gemaakt: string;
  model: string;
  bladeren: number;
  vertaald: number;
  steekproef: { gekozen: number; klopt: number; percentage: number };
}

export const GEN_KOP = "// GEGENEREERD door scripts/talen-motor.mjs: niet met de hand aanpassen. Verbeteringen horen in lib/i18n/overrides/<taal>.ts.";
const HASH_REGEL = /^\/\/ inhoud-hash: ([0-9a-f]{64})$/m;

export const inhoudHash = (inhoud: string): string => createHash("sha256").update(inhoud).digest("hex");

/** Zet vertaalde bladeren terug in een geneste vorm; een array komt er alleen in als elk element vertaald is. */
export function bouwDeelsWoordenboek(bron: unknown, vertaald: ReadonlyMap<string, string>, pad: Pad = []): unknown {
  if (typeof bron === "string") return vertaald.get(padSleutel(pad));
  if (Array.isArray(bron)) {
    const delen = bron.map((v, i) => bouwDeelsWoordenboek(v, vertaald, [...pad, i]));
    return delen.every((d) => d !== undefined) ? delen : undefined;
  }
  if (bron !== null && typeof bron === "object") {
    const uit: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(bron as Record<string, unknown>)) {
      const d = bouwDeelsWoordenboek(v, vertaald, [...pad, k]);
      if (d !== undefined && !(typeof d === "object" && !Array.isArray(d) && Object.keys(d as object).length === 0)) uit[k] = d;
    }
    return uit;
  }
  return undefined;
}

/** De tekst van lib/i18n/gen/freelancer.<taal>.ts. De hash staat bovenaan en dekt alles eronder (een test controleert hem). */
export function renderGenBestand(meta: GenMeta, dict: unknown): string {
  const lichaam = [
    `import type { FreelancerDict } from "@/lib/i18n/freelancer";`,
    `import type { DiepDeels } from "@/lib/i18n/talen-motor";`,
    "",
    `export const meta = ${JSON.stringify(meta, null, 2)} as const;`,
    "",
    `/** Juridisch (uitzendovereenkomst, voorwaarden, privacy, loonstrook, BSN/ID) staat hier niet: ${JURIDISCH_REGEL} */`,
    `export const dict: DiepDeels<FreelancerDict> = ${JSON.stringify(dict, null, 1)};`,
    "",
  ].join("\n");
  return `${GEN_KOP}\n// inhoud-hash: ${inhoudHash(lichaam)}\n${lichaam}`;
}

/** Controleert dat een gegenereerd bestand niet met de hand is aangepast. */
export function genHashKlopt(ruw: string): boolean {
  const bestand = ruw.replace(/\r\n/g, "\n"); // een checkout op Windows maakt er CRLF van
  const m = HASH_REGEL.exec(bestand);
  if (!m) return false;
  const na = bestand.indexOf("\n", bestand.indexOf("// inhoud-hash:")) + 1;
  return inhoudHash(bestand.slice(na)) === m[1];
}

/** lib/i18n/gen/index.ts: één dynamische import per taal, zodat nooit alle talen in één bundel komen. */
export function renderGenIndex(talen: readonly string[]): string {
  const regels = [...talen].sort().map((t) => `  ${JSON.stringify(t)}: () => import("./freelancer.${t}"),`);
  const inhoud = [
    `import type { FreelancerDict } from "@/lib/i18n/freelancer";`,
    `import type { DiepDeels } from "@/lib/i18n/talen-motor";`,
    "",
    `export type GenLader = () => Promise<{ dict: DiepDeels<FreelancerDict> }>;`,
    "",
    `/** Per taal een eigen lazy chunk. */`,
    `export const GEN_LADERS: Readonly<Record<string, GenLader>> = {`,
    ...regels,
    `};`,
    "",
  ].join("\n");
  return `${GEN_KOP}\n// inhoud-hash: ${inhoudHash(inhoud)}\n${inhoud}`;
}
