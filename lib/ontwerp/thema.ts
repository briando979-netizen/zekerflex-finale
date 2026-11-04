import { contrast } from "@/lib/rijschool/kleuren";

// ---------------------------------------------------------------------------
// Site-ontwerper (Admin → Site-ontwerper): de stijl van de eigen ZekerFlex-site
// zonder code. Een thema is een handvol keuzes (kleuren, lettertypes, vormen,
// maten); themaCss() maakt daar CSS van die over de vaste stijl heen gaat. Staat
// alles op standaard, dan komt er niets bij en ziet de site er exact uit zoals
// altijd. Puur en browser-veilig: de ontwerper rekent het voorbeeld zelf uit,
// de server (app/layout.tsx) gebruikt dezelfde functie voor de live site.
// De betekeniskleuren (groen doen, blauw gepland, amber wacht op jou, violet
// verificatie, goud geld, rood probleem) staan hier bewust niet in.
// ---------------------------------------------------------------------------

export const LETTERTYPES = {
  bricolage: { label: "Bricolage Grotesque", soort: "Modern, karaktervol", stack: '"Bricolage Grotesque","Bricolage Grotesque Fallback",ui-sans-serif,system-ui,sans-serif' },
  "instrument-sans": { label: "Instrument Sans", soort: "Strak en rustig", stack: '"Instrument Sans","Instrument Sans Fallback",ui-sans-serif,system-ui,sans-serif' },
  "instrument-serif": { label: "Instrument Serif", soort: "Elegant, met schreef", stack: '"Instrument Serif",Georgia,Cambria,serif' },
  "plex-mono": { label: "IBM Plex Mono", soort: "Technisch, vaste breedte", stack: '"IBM Plex Mono","IBM Plex Mono Fallback",ui-monospace,monospace' },
  systeem: { label: "Systeemletter", soort: "Zoals het apparaat zelf", stack: 'system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif' },
  georgia: { label: "Georgia", soort: "Klassiek, met schreef", stack: 'Georgia,"Times New Roman",serif' },
  palatino: { label: "Palatino", soort: "Boekletter, warm", stack: '"Palatino Linotype",Palatino,"Book Antiqua",serif' },
  verdana: { label: "Verdana", soort: "Breed en goed leesbaar", stack: "Verdana,Geneva,sans-serif" },
  trebuchet: { label: "Trebuchet", soort: "Vriendelijk", stack: '"Trebuchet MS",Helvetica,sans-serif' },
} as const;
export type LettertypeKey = keyof typeof LETTERTYPES;

export const HOEKEN = { recht: "Recht", zacht: "Licht afgerond", standaard: "Afgerond", rond: "Extra rond" } as const;
export type Hoeken = keyof typeof HOEKEN;
export const KNOPPEN = { pil: "Pil", afgerond: "Afgerond", recht: "Recht" } as const;
export type KnopVorm = keyof typeof KNOPPEN;
export const SCHADUWEN = { geen: "Geen", zacht: "Zacht", standaard: "Standaard", diep: "Diep" } as const;
export type Schaduw = keyof typeof SCHADUWEN;

export interface Thema {
  /** knoppen, koppeltekens, links */
  primair: string;
  /** accent op donker (de mint) */
  accent: string;
  /** donkere vlakken (hero, voettekst) */
  inkt: string;
  /** achtergrond van de pagina */
  papier: string;
  koppen: LettertypeKey;
  tekst: LettertypeKey;
  hoeken: Hoeken;
  knoppen: KnopVorm;
  schaduw: Schaduw;
  /** procent van de gewone tekstgrootte, 90–115 */
  tekstgrootte: number;
  /** breedte van de inhoud in px, 1040–1440 */
  breedte: number;
}

/** Een gepubliceerde versie, om terug te zetten. */
export interface OntwerpVersie {
  id: string;
  thema: Thema;
  op: string;
  door: string;
  notitie: string;
}

/** Wat de ontwerper bij het openen krijgt (lib/ontwerp/store.ts). */
export interface OntwerpStaat {
  concept: Thema;
  conceptOp: string | null;
  live: Thema;
  liveOp: string | null;
  geschiedenis: OntwerpVersie[];
}

export const STANDAARD_THEMA: Thema = {
  primair: "#0E5C4A",
  accent: "#4FE0A0",
  inkt: "#0C0E12",
  papier: "#FCFCFA",
  koppen: "bricolage",
  tekst: "instrument-sans",
  hoeken: "standaard",
  knoppen: "pil",
  schaduw: "standaard",
  tekstgrootte: 100,
  breedte: 1180,
};

export const TEKSTGROOTTE = { min: 90, max: 115 } as const;
export const BREEDTE = { min: 1040, max: 1440 } as const;

/** Kant-en-klare stijlen; de eigenaar kan daarna alles nog aanpassen. */
export const STIJLEN: { id: string; naam: string; thema: Thema }[] = [
  { id: "zekerflex", naam: "ZekerFlex", thema: STANDAARD_THEMA },
  { id: "oceaan", naam: "Oceaan", thema: { ...STANDAARD_THEMA, primair: "#1D4E89", accent: "#5BC0EB", inkt: "#0B1624", papier: "#FBFCFE", hoeken: "rond" } },
  { id: "bos", naam: "Bos", thema: { ...STANDAARD_THEMA, primair: "#2F5D3A", accent: "#A3D977", inkt: "#0F1A12", papier: "#FBFBF6", koppen: "instrument-serif", hoeken: "zacht", knoppen: "afgerond" } },
  { id: "zonsondergang", naam: "Zonsondergang", thema: { ...STANDAARD_THEMA, primair: "#A63A26", accent: "#F4A259", inkt: "#1B0F0C", papier: "#FFF9F3", hoeken: "rond", schaduw: "diep" } },
  { id: "zakelijk", naam: "Zakelijk", thema: { ...STANDAARD_THEMA, primair: "#1F3A5F", accent: "#E0B84F", inkt: "#101820", papier: "#FAFAF8", koppen: "georgia", tekst: "systeem", hoeken: "recht", knoppen: "recht", schaduw: "zacht" } },
  { id: "paars", naam: "Paars modern", thema: { ...STANDAARD_THEMA, primair: "#5B3CC4", accent: "#B79CFF", inkt: "#120D24", papier: "#FCFBFF", hoeken: "rond", schaduw: "diep" } },
  { id: "aards", naam: "Warm aards", thema: { ...STANDAARD_THEMA, primair: "#7A4E22", accent: "#E9C46A", inkt: "#1E1610", papier: "#FBF7F0", koppen: "palatino", tekst: "trebuchet", hoeken: "zacht", knoppen: "afgerond" } },
  { id: "minimaal", naam: "Minimaal", thema: { ...STANDAARD_THEMA, primair: "#111827", accent: "#E5E7EB", inkt: "#0A0A0A", papier: "#FFFFFF", koppen: "instrument-sans", hoeken: "recht", knoppen: "recht", schaduw: "geen" } },
  { id: "roze", naam: "Fris roze", thema: { ...STANDAARD_THEMA, primair: "#BE185D", accent: "#F9A8D4", inkt: "#1F0A14", papier: "#FFFBFD", hoeken: "rond" } },
  { id: "nacht", naam: "Nacht & neon", thema: { ...STANDAARD_THEMA, primair: "#0F766E", accent: "#22D3EE", inkt: "#05080F", papier: "#F8FAFC", koppen: "plex-mono", hoeken: "zacht", schaduw: "diep" } },
];

const HEX = /^#[0-9a-fA-F]{6}$/;
const kies = <T extends string>(v: unknown, lijst: Record<T, unknown>, standaard: T): T => (typeof v === "string" && v in lijst ? (v as T) : standaard);
const kleur = (v: unknown, standaard: string) => (typeof v === "string" && HEX.test(v) ? v.toUpperCase() : standaard);
const getal = (v: unknown, min: number, max: number, standaard: number) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.round(Math.min(max, Math.max(min, n))) : standaard;
};

/** Alles wat binnenkomt (opgeslagen, van de AI, uit het formulier) wordt een geldig thema. */
export function normalizeThema(raw: unknown): Thema {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const s = STANDAARD_THEMA;
  return {
    primair: kleur(r.primair, s.primair),
    accent: kleur(r.accent, s.accent),
    inkt: kleur(r.inkt, s.inkt),
    papier: kleur(r.papier, s.papier),
    koppen: kies(r.koppen, LETTERTYPES, s.koppen),
    tekst: kies(r.tekst, LETTERTYPES, s.tekst),
    hoeken: kies(r.hoeken, HOEKEN, s.hoeken),
    knoppen: kies(r.knoppen, KNOPPEN, s.knoppen),
    schaduw: kies(r.schaduw, SCHADUWEN, s.schaduw),
    tekstgrootte: getal(r.tekstgrootte, TEKSTGROOTTE.min, TEKSTGROOTTE.max, s.tekstgrootte),
    breedte: getal(r.breedte, BREEDTE.min, BREEDTE.max, s.breedte),
  };
}

export function zelfdeThema(a: Thema, b: Thema): boolean {
  return (Object.keys(STANDAARD_THEMA) as (keyof Thema)[]).every((k) => String(a[k]).toLowerCase() === String(b[k]).toLowerCase());
}

type RGB = [number, number, number];
const rgb = (hex: string): RGB => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const mix = (c: RGB, t: RGB, deel: number): RGB => [0, 1, 2].map((i) => Math.round(c[i]! + (t[i]! - c[i]!) * deel)) as RGB;
const kanalen = (c: RGB) => c.join(" ");
const rgba = (c: RGB, a: number) => `rgba(${c.join(",")},${a})`;
const WIT: RGB = [255, 255, 255];
const ZWART: RGB = [0, 0, 0];

const HOEK_FACTOR: Record<Hoeken, number> = { recht: 0.2, zacht: 0.6, standaard: 1, rond: 1.5 };
const KNOP_RADIUS: Record<KnopVorm, string> = { pil: "9999px", afgerond: "0.75rem", recht: "0.25rem" };
/** Tailwind-afrondingen op de site, in rem. */
const RADII: [string, number][] = [["rounded-lg", 0.5], ["rounded-xl", 0.75], ["rounded-2xl", 1], ["rounded-3xl", 1.5], ["rounded-xl2", 1.25], ["rounded-xl3", 1.75]];
const SCHADUW_CSS: Record<Schaduw, Record<"card" | "lift" | "e1" | "e2" | "sm", string>> = {
  // de vaste waarden uit tailwind.config.ts (voor het voorbeeld over een live keuze heen)
  standaard: {
    card: "0 1px 2px rgba(12,14,18,0.04), 0 12px 32px -16px rgba(12,14,18,0.16)",
    lift: "0 2px 8px rgba(12,14,18,0.06), 0 24px 60px -24px rgba(12,14,18,0.28)",
    e1: "0 1px 2px rgba(12,14,18,0.05), 0 4px 10px -4px rgba(12,14,18,0.10)",
    e2: "0 2px 4px rgba(12,14,18,0.05), 0 14px 32px -12px rgba(12,14,18,0.18)",
    sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
  },
  geen: { card: "0 0 #0000", lift: "0 0 #0000", e1: "0 0 #0000", e2: "0 0 #0000", sm: "0 0 #0000" },
  zacht: {
    card: "0 1px 2px rgba(12,14,18,0.03), 0 8px 20px -14px rgba(12,14,18,0.10)",
    lift: "0 1px 4px rgba(12,14,18,0.04), 0 14px 34px -20px rgba(12,14,18,0.16)",
    e1: "0 1px 2px rgba(12,14,18,0.04)",
    e2: "0 1px 3px rgba(12,14,18,0.04), 0 8px 18px -10px rgba(12,14,18,0.10)",
    sm: "0 1px 2px rgba(12,14,18,0.04)",
  },
  diep: {
    card: "0 2px 4px rgba(12,14,18,0.06), 0 22px 48px -18px rgba(12,14,18,0.30)",
    lift: "0 4px 12px rgba(12,14,18,0.08), 0 36px 80px -28px rgba(12,14,18,0.42)",
    e1: "0 2px 4px rgba(12,14,18,0.08), 0 8px 16px -6px rgba(12,14,18,0.16)",
    e2: "0 3px 6px rgba(12,14,18,0.07), 0 22px 44px -14px rgba(12,14,18,0.28)",
    sm: "0 2px 6px rgba(12,14,18,0.10)",
  },
};

/**
 * De CSS bij een thema. `alles` schrijft ook de standaardwaarden uit: het voorbeeld
 * in de ontwerper legt zo zijn concept over wat er live staat. Zonder `alles`:
 * null bij het standaardthema, zodat de live site dan niets extra's laadt.
 * Alleen kleuren gelden overal (ook in de app); vormen, lettertypes en maten
 * alleen op de openbare site (.zf-site, app/(marketing)/layout.tsx).
 */
export function themaCss(input: Thema, opts: { alles?: boolean } = {}): string | null {
  const t = normalizeThema(input);
  const s = STANDAARD_THEMA;
  const alles = Boolean(opts.alles);
  const anders = (k: keyof Thema) => alles || String(t[k]).toLowerCase() !== String(s[k]).toLowerCase();
  const regels: string[] = [];

  if (anders("primair") || anders("accent")) {
    const p = rgb(t.primair);
    regels.push(
      `:root{--brand-50-rgb:${kanalen(mix(p, WIT, 0.9))};--brand-100-rgb:${kanalen(mix(p, WIT, 0.76))};--brand-300-rgb:${kanalen(mix(p, WIT, 0.42))};--brand-500-rgb:${kanalen(p)};--brand-600-rgb:${kanalen(mix(p, ZWART, 0.18))};--brand-700-rgb:${kanalen(mix(p, ZWART, 0.36))};--brand-mint-rgb:${kanalen(rgb(t.accent))}}`,
    );
  }
  if (anders("primair") || anders("accent") || anders("inkt")) {
    regels.push(
      `.hero-ink{background:radial-gradient(1100px 500px at 12% -10%,${rgba(rgb(t.accent), 0.16)},transparent 60%),radial-gradient(900px 600px at 100% 0%,${rgba(rgb(t.primair), 0.28)},transparent 55%),${t.inkt}}`,
    );
  }
  if (anders("inkt")) regels.push(`.zf-site .bg-ink{background-color:${t.inkt}}`);
  if (anders("papier")) {
    regels.push(`.zf-site.bg-paper,.zf-site .bg-paper{background-color:${t.papier}}`, `.zf-site .bg-paper-soft{background-color:${`rgb(${mix(rgb(t.papier), ZWART, 0.035).join(",")})`}}`);
  }
  if (anders("koppen") || anders("tekst")) {
    const tekst = LETTERTYPES[t.tekst].stack;
    regels.push(`.zf-site{--font-display:${LETTERTYPES[t.koppen].stack};--font-sans:${tekst};font-family:${tekst}}`);
  }
  if (anders("hoeken")) {
    const f = HOEK_FACTOR[t.hoeken];
    regels.push(RADII.map(([cls, rem]) => `.zf-site .${cls}{border-radius:${+(rem * f).toFixed(3)}rem}`).join(""));
    regels.push(`.zf-site .card,.zf-site .surface{border-radius:${+(1.25 * f).toFixed(3)}rem}`);
  }
  if (anders("knoppen")) regels.push(`.zf-site .btn,.zf-site .btn-primary,.zf-site .btn-ghost,.zf-site .btn-mint,.zf-site .btn-ghost-invert{border-radius:${KNOP_RADIUS[t.knoppen]}}`);
  if (anders("schaduw")) {
    const sc = SCHADUW_CSS[t.schaduw];
    regels.push(
      `.zf-site .shadow-card{--tw-shadow:${sc.card}}.zf-site .shadow-lift,.zf-site .hover\\:shadow-lift:hover{--tw-shadow:${sc.lift}}.zf-site .shadow-e1{--tw-shadow:${sc.e1}}.zf-site .shadow-e2,.zf-site .hover\\:shadow-e2:hover{--tw-shadow:${sc.e2}}.zf-site .shadow-sm{--tw-shadow:${sc.sm}}`,
    );
  }
  if (anders("tekstgrootte")) regels.push(`html:has(.zf-site){font-size:${t.tekstgrootte}%}`);
  if (anders("breedte")) regels.push(`.zf-site .shell{max-width:${t.breedte}px}`);

  const css = regels.filter(Boolean).join("\n");
  return css || null;
}

export interface ContrastCheck {
  label: string;
  ratio: number;
  ok: boolean;
}

/** WCAG AA (4,5:1) voor de combinaties die op de site echt voorkomen. */
export function contrastChecks(input: Thema): ContrastCheck[] {
  const t = normalizeThema(input);
  const rij = (label: string, a: string, b: string): ContrastCheck => {
    const ratio = Math.round(contrast(a, b) * 100) / 100;
    return { label, ratio, ok: ratio >= 4.5 };
  };
  return [
    rij("Witte tekst op knoppen in de hoofdkleur", t.primair, "#FFFFFF"),
    rij("Hoofdkleur als tekst op de pagina", t.primair, t.papier),
    rij("Gewone tekst op de pagina", "#0C0E12", t.papier),
    rij("Witte tekst op donkere vlakken", "#FFFFFF", t.inkt),
    rij("Accent als tekst op donkere vlakken", t.accent, t.inkt),
  ];
}
