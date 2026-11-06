// De rekenkern van de paskamer (/shop/paskamer): welk kledingstuk waar op de
// paspop hoort, welke kleur het krijgt, de lichaamsmaten (gemeten of geschat
// uit lengte en gewicht) en het maatadvies per product. Puur: geen React, geen
// database, zodat de server, de paskamer en de productpagina dezelfde regels
// gebruiken en het getest kan worden.

export type Silhouet = "heren" | "dames" | "kind";
export type Bouw = "slank" | "gemiddeld" | "stevig";
export type Voorkeur = "nauw" | "normaal" | "ruim";

/** Wat iemand over zichzelf invult. Alles behalve silhouet en lengte mag leeg (dan schatten we). */
export type Lichaam = {
  silhouet: Silhouet;
  lengte: number; // cm
  gewicht: number | null; // kg
  bouw: Bouw;
  borst: number | null; // borstomtrek in cm
  taille: number | null; // tailleomtrek in cm
  schoenmaat: number | null;
  voorkeur: Voorkeur;
};

export const STANDAARD_LICHAAM: Record<Silhouet, Lichaam> = {
  heren: { silhouet: "heren", lengte: 180, gewicht: null, bouw: "gemiddeld", borst: null, taille: null, schoenmaat: null, voorkeur: "normaal" },
  dames: { silhouet: "dames", lengte: 168, gewicht: null, bouw: "gemiddeld", borst: null, taille: null, schoenmaat: null, voorkeur: "normaal" },
  kind: { silhouet: "kind", lengte: 134, gewicht: null, bouw: "gemiddeld", borst: null, taille: null, schoenmaat: null, voorkeur: "normaal" },
};

export const LENGTE_GRENZEN: Record<Silhouet, [number, number]> = { heren: [150, 210], dames: [145, 200], kind: [90, 175] };

export type Maten = { borst: number; taille: number; heup: number; schoenmaat: number; geschat: { borst: boolean; taille: boolean; schoenmaat: boolean } };

const BMI_BIJ_BOUW: Record<Silhouet, Record<Bouw, number>> = {
  heren: { slank: 20.5, gemiddeld: 24, stevig: 29 },
  dames: { slank: 19.5, gemiddeld: 23, stevig: 28.5 },
  kind: { slank: 15, gemiddeld: 17, stevig: 20.5 },
};
const rond = (n: number) => Math.round(n * 10) / 10;
const tussen = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** Lichaamsmaten: wat iemand zelf invulde, de rest geschat uit lengte en gewicht (of bouw). */
export function maten(l: Lichaam): Maten {
  const h = tussen(l.lengte, 80, 220);
  const bmi = l.gewicht && l.gewicht > 15 ? tussen(l.gewicht / (h / 100) ** 2, 12, 45) : BMI_BIJ_BOUW[l.silhouet][l.bouw];
  // vuistregels uit lichaamsmaattabellen; per silhouet gekalibreerd op een
  // gemiddelde volwassene (180 cm / 80 kg ≈ borst 99, taille 92)
  const f = {
    heren: { b: [0.52, 22.5, 0.55], t: [0.47, 22.5, 0.9], h: [0.53, 22.5, 0.5] },
    dames: { b: [0.53, 22, 0.55], t: [0.44, 22, 0.9], h: [0.6, 22, 0.5] },
    kind: { b: [0.5, 17, 0.5], t: [0.45, 17, 0.8], h: [0.52, 17, 0.5] },
  }[l.silhouet];
  const schat = ([k, ref, exp]: number[]) => (k ?? 0) * h * (bmi / (ref ?? 1)) ** (exp ?? 1);
  const schoen = l.silhouet === "heren" ? 0.25 * h - 2.5 : l.silhouet === "dames" ? 0.25 * h - 3.5 : 0.25 * h - 4;
  return {
    borst: rond(l.borst ?? schat(f.b)),
    taille: rond(l.taille ?? schat(f.t)),
    heup: rond(schat(f.h)),
    schoenmaat: Math.round(l.schoenmaat ?? schoen),
    geschat: { borst: l.borst === null, taille: l.taille === null, schoenmaat: l.schoenmaat === null },
  };
}

// ---------------------------------------------------------------------------
// Kledingstukken op de paspop
// ---------------------------------------------------------------------------

/** De lagen van onder naar boven; een product kan meerdere lagen vullen (een pakket). */
export const SLOTS = ["sokken", "onder", "voeten", "knie", "riem", "top", "midden", "jas", "hesje", "handen", "tas", "hoofd", "gezicht"] as const;
export type Slot = (typeof SLOTS)[number];

export type Soort =
  | "tshirt" | "overhemd" | "blouse" | "hoodie" | "overshirt" | "fleece" | "bodywarmer" | "softshell" | "hesje"
  | "chino" | "werkbroek" | "thermobroek" | "riem" | "kniebeschermer"
  | "werkschoen" | "sneaker" | "antislip" | "sokken" | "handschoen" | "snijhandschoen"
  | "pet" | "helm" | "bril" | "tas";

/** Welk maatsysteem het advies gebruikt. */
export type Maatsysteem = "boven" | "onder" | "schoen" | "sok" | "hand" | "kind" | "over" | "geen";

export type Kledingstuk = { slot: Slot; soort: Soort; /** eigen kleur binnen een pakket */ kleur?: string };
export type Pasvorm = { stukken: Kledingstuk[]; systeem: Maatsysteem; kleur: string; accent?: string };

const SOORT_SLOT: Record<Soort, Slot> = {
  tshirt: "top", overhemd: "top", blouse: "top", hoodie: "top",
  overshirt: "midden", fleece: "midden",
  bodywarmer: "jas", softshell: "jas", hesje: "hesje",
  chino: "onder", werkbroek: "onder", thermobroek: "onder", riem: "riem", kniebeschermer: "knie",
  werkschoen: "voeten", sneaker: "voeten", antislip: "voeten", sokken: "sokken",
  handschoen: "handen", snijhandschoen: "handen", pet: "hoofd", helm: "hoofd", bril: "gezicht", tas: "tas",
};
const stuk = (soort: Soort): Kledingstuk => ({ slot: SOORT_SLOT[soort], soort });

// De eigen catalogus op slug, met de kleur van de productfoto. Nieuwe of
// verkopersproducten vallen terug op de naamregels hieronder.
const OP_SLUG: Record<string, Omit<Pasvorm, "stukken"> & { soorten: Soort[]; kleuren?: string[] }> = {
  "everyday-hoodie": { soorten: ["hoodie"], systeem: "boven", kleur: "#20433b", accent: "#4fe0a0" },
  "field-overshirt": { soorten: ["overshirt"], systeem: "boven", kleur: "#5f6b4a" },
  "zf-core-cap": { soorten: ["pet"], systeem: "geen", kleur: "#173a33", accent: "#4fe0a0" },
  "workday-tote": { soorten: ["tas"], systeem: "geen", kleur: "#e7dcc6" },
  "shift-socks-2-pack": { soorten: ["sokken"], systeem: "sok", kleur: "#4b5157" },
  "veiligheidsschoenen-s3": { soorten: ["werkschoen"], systeem: "schoen", kleur: "#8a5632", accent: "#d9c3a0" },
  "veiligheidssneakers-s1p": { soorten: ["sneaker"], systeem: "schoen", kleur: "#3b4047", accent: "#f1f1ee" },
  "antislip-werkschoenen-ob": { soorten: ["antislip"], systeem: "schoen", kleur: "#1f2124", accent: "#3a3d42" },
  "werkhandschoenen-grip": { soorten: ["handschoen"], systeem: "hand", kleur: "#d8c79c", accent: "#5b5145" },
  "snijbestendige-handschoenen": { soorten: ["snijhandschoen"], systeem: "hand", kleur: "#79c143", accent: "#4a4f55" },
  veiligheidshesje: { soorten: ["hesje"], systeem: "over", kleur: "#e4f23d", accent: "#c9ced3" },
  "veiligheidsbril-helder": { soorten: ["bril"], systeem: "geen", kleur: "#dfe9ef" },
  kniebeschermers: { soorten: ["kniebeschermer"], systeem: "geen", kleur: "#26292d" },
  "werkbroek-kniezakken": { soorten: ["werkbroek"], systeem: "onder", kleur: "#2c2f34", accent: "#1d1f22" },
  "softshell-werkjas": { soorten: ["softshell"], systeem: "boven", kleur: "#26292e", accent: "#4fe0a0" },
  veiligheidshelm: { soorten: ["helm"], systeem: "geen", kleur: "#f6f6f3" },
  "werk-tshirt-2pack": { soorten: ["tshirt"], systeem: "boven", kleur: "#3c9ad1" },
  "thermo-bodywarmer-unisex": { soorten: ["bodywarmer"], systeem: "boven", kleur: "#1d1f22" },
  "fleece-vest-met-rits": { soorten: ["fleece"], systeem: "boven", kleur: "#2a2c30" },
  "thermo-broek-gevoerd": { soorten: ["thermobroek"], systeem: "onder", kleur: "#1e2023" },
  "business-overhemd-heren": { soorten: ["overhemd"], systeem: "boven", kleur: "#f6f6f2" },
  "business-blouse-dames": { soorten: ["blouse"], systeem: "boven", kleur: "#f6f6f2" },
  "chino-broek-zakelijk": { soorten: ["chino"], systeem: "onder", kleur: "#c4a46b" },
  "zekerflex-kids-tshirt": { soorten: ["tshirt"], systeem: "kind", kleur: "#1d1f22", accent: "#4fe0a0" },
  "winterpakket-bodywarmer-fleece": { soorten: ["fleece", "bodywarmer"], kleuren: ["#4b5157", "#1d1f22"], systeem: "boven", kleur: "#1d1f22" },
  "zakelijk-riem-heren": { soorten: ["riem"], systeem: "geen", kleur: "#3a2618", accent: "#c9b27c" },
};

// Volgorde telt: de eerste regel die past wint (specifiek vóór algemeen).
const NAAMREGELS: ReadonlyArray<readonly [RegExp, Soort, Maatsysteem]> = [
  [/hesje|reflecterend vest|high.?vis/, "hesje", "over"],
  [/bodywarmer|gilet/, "bodywarmer", "boven"],
  [/softshell|werkjas|parka|\bjas\b|jack/, "softshell", "boven"],
  [/fleece/, "fleece", "boven"],
  [/overshirt|shacket/, "overshirt", "boven"],
  [/hoodie|sweater|\btrui\b/, "hoodie", "boven"],
  [/blouse/, "blouse", "boven"],
  [/overhemd|\bshirt\b(?!.*t-?shirt)/, "overhemd", "boven"],
  [/t-?shirt|polo/, "tshirt", "boven"],
  [/werkbroek|kniezak/, "werkbroek", "onder"],
  [/thermo.?broek/, "thermobroek", "onder"],
  [/broek|chino|jeans|pantalon/, "chino", "onder"],
  [/kniebescherm/, "kniebeschermer", "geen"],
  [/\briem\b/, "riem", "geen"],
  [/snijbestendig|snijvast/, "snijhandschoen", "hand"],
  [/handschoen/, "handschoen", "hand"],
  [/sneaker/, "sneaker", "schoen"],
  [/antislip/, "antislip", "schoen"],
  [/schoen|laars|\bboot/, "werkschoen", "schoen"],
  [/sok/, "sokken", "sok"],
  [/\bhelm\b/, "helm", "geen"],
  [/\bbril\b/, "bril", "geen"],
  [/\bcap\b|\bpet\b|baseball/, "pet", "geen"],
  [/\btas\b|tote/, "tas", "geen"],
];

/** Welk maatsysteem bij welke soort hoort (voor producten waarvan de AI of de eigenaar de soort vastlegde). */
export const SOORT_SYSTEEM: Record<Soort, Maatsysteem> = {
  tshirt: "boven", overhemd: "boven", blouse: "boven", hoodie: "boven", overshirt: "boven", fleece: "boven", bodywarmer: "boven", softshell: "boven", hesje: "over",
  chino: "onder", werkbroek: "onder", thermobroek: "onder", riem: "geen", kniebeschermer: "geen",
  werkschoen: "schoen", sneaker: "schoen", antislip: "schoen", sokken: "sok", handschoen: "hand", snijhandschoen: "hand",
  pet: "geen", helm: "geen", bril: "geen", tas: "geen",
};
export const SOORTEN = Object.keys(SOORT_SYSTEEM) as Soort[];
export const isSoort = (v: unknown): v is Soort => typeof v === "string" && (SOORTEN as string[]).includes(v);

/** Hoe het product op de paspop komt, of null als het niet te dragen is (fles, boek, oordopjes). `soort` = vastgelegd door de Winkel-AI of de eigenaar. */
export function pasvormVoor(p: { slug: string; name: string; gender?: string | null; firstColor?: string | null; soort?: Soort | null }): Pasvorm | null {
  const vast = OP_SLUG[p.slug];
  if (vast) {
    const stukken = vast.soorten.map((soort, i) => {
      const k = vast.kleuren?.[i];
      return k ? { ...stuk(soort), kleur: k } : stuk(soort);
    });
    return { stukken, systeem: vast.systeem, kleur: vast.kleur, ...(vast.accent ? { accent: vast.accent } : {}) };
  }
  if (p.soort && isSoort(p.soort)) {
    const kind = p.gender === "kinderen" && (SOORT_SYSTEEM[p.soort] === "boven" || SOORT_SYSTEEM[p.soort] === "onder");
    return { stukken: [stuk(p.soort)], systeem: kind ? "kind" : SOORT_SYSTEEM[p.soort], kleur: kleurHex(p.firstColor ?? null) ?? "#4b5157" };
  }
  const tekst = `${p.name} ${p.slug}`.toLowerCase();
  if (/fles|bottle|boek|book|oordop|gehoor|notes|kit\b/.test(tekst)) return null;
  for (const [re, soort, systeem] of NAAMREGELS) {
    if (!re.test(tekst)) continue;
    const kind = p.gender === "kinderen" && (systeem === "boven" || systeem === "onder");
    return { stukken: [stuk(soort)], systeem: kind ? "kind" : systeem, kleur: kleurHex(p.firstColor ?? null) ?? "#4b5157" };
  }
  return null;
}

// Kleurnamen zoals ze in de varianten staan → een kleur voor de paspop.
const KLEUREN: Record<string, string> = {
  zwart: "#1d1f22", antraciet: "#34373c", grijs: "#8a8f95", lichtgrijs: "#c9ccd0", donkergrijs: "#4b5157",
  wit: "#f6f6f2", gebroken: "#efeadf", creme: "#efe6d2", beige: "#d9c6a5", zand: "#d6c29a", khaki: "#c4a46b",
  bruin: "#7a4e2d", cognac: "#9a5b2a", camel: "#b98a55",
  marineblauw: "#1f2f4f", navy: "#1f2f4f", donkerblauw: "#1d3557", blauw: "#2f6fb8", lichtblauw: "#cfe0ef", kobalt: "#1f4fc0",
  groen: "#2f7d4f", donkergroen: "#20433b", olijf: "#5f6b4a", mintgroen: "#bfe8d4", mint: "#bfe8d4", legergroen: "#4b5a3a",
  rood: "#c2342d", bordeaux: "#6d1f2c", roze: "#f2b8c6", oranje: "#ee7d2b", geel: "#f3cf3a", fluorgeel: "#e4f23d", fluororanje: "#ff7a1a",
  paars: "#6b4c9a", lila: "#c8b6e2",
};

/** Kleurnaam → hex; ook "Fluor geel" en "Donker-blauw". Onbekend → null. */
export function kleurHex(naam: string | null): string | null {
  if (!naam) return null;
  const k = naam.toLowerCase().replace(/[\s-]+/g, "");
  return KLEUREN[k] ?? null;
}

// ---------------------------------------------------------------------------
// Maatadvies
// ---------------------------------------------------------------------------

/** Lichaamsmaten per maat (algemene Europese maattabel, borst- of tailleomtrek in cm). */
const BORST: Record<"heren" | "dames", Record<string, [number, number]>> = {
  heren: { XS: [82, 89], S: [89, 95], M: [95, 101], L: [101, 107], XL: [107, 113], XXL: [113, 119], "3XL": [119, 125] },
  dames: { XS: [78, 82], S: [82, 86], M: [86, 92], L: [92, 98], XL: [98, 104], XXL: [104, 110], "3XL": [110, 116] },
};
const TAILLE: Record<"heren" | "dames", Record<string, [number, number]>> = {
  heren: { XS: [68, 74], S: [74, 80], M: [80, 86], L: [86, 94], XL: [94, 102], XXL: [102, 110], "3XL": [110, 118] },
  dames: { XS: [62, 66], S: [66, 70], M: [70, 76], L: [76, 82], XL: [82, 88], XXL: [88, 94], "3XL": [94, 100] },
};
const STAP = { nauw: -1, normaal: 0, ruim: 1 } as const;

export type Oordeel = "goed" | "nauw" | "ruim" | "krap" | "te-ruim";
export type Advies = {
  /** de maat die we aanraden (één van de beschikbare), of null als het product geen maten heeft */
  maat: string | null;
  /** hoe de gekozen maat valt */
  oordeel: Oordeel;
  /** verschil tussen het midden van de maat en jouw maat, in cm (+ = ruimer), voor de tekening */
  ruimte: number;
  /** de advies-maat is een schatting (lengte/gewicht in plaats van gemeten) */
  geschat: boolean;
};

const oordeelUit = (verschil: number, breedte: number): Oordeel => {
  // verschil = midden van de maat − lichaam; binnen een halve maat = goed
  const half = breedte / 2;
  if (verschil < -half - 3) return "krap";
  if (verschil < -half + 0.5) return "nauw";
  if (verschil <= half + 0.5) return "goed";
  if (verschil <= half + breedte) return "ruim";
  return "te-ruim";
};

/**
 * Advies voor één product: de best passende maat uit `beschikbaar` en hoe
 * `gekozen` (of het advies als er niets gekozen is) valt. Werkt met lettermaten,
 * schoenmaten (38–47), sokken ("39-42") en kindermaten op lengte (98, 110 …).
 */
export function maatAdvies(systeem: Maatsysteem, beschikbaar: string[], l: Lichaam, gekozen: string | null = null): Advies {
  const m = maten(l);
  if (beschikbaar.length === 0 || systeem === "geen") return { maat: null, oordeel: "goed", ruimte: 0, geschat: false };
  const tabelSil = l.silhouet === "dames" ? "dames" : "heren";

  if (systeem === "schoen" || systeem === "sok") {
    const doel = m.schoenmaat;
    const bereik = (s: string): [number, number] => {
      const [a = NaN, b] = s.split(/[-–/]/).map((x) => parseFloat(x));
      return [a, Number.isNaN(b ?? NaN) ? a : (b as number)];
    };
    const afstand = (s: string) => {
      const [a, b] = bereik(s);
      return doel < a ? a - doel : doel > b ? doel - b : 0;
    };
    const beste = [...beschikbaar].filter((s) => !Number.isNaN(bereik(s)[0])).sort((x, y) => afstand(x) - afstand(y))[0] ?? beschikbaar[0] ?? null;
    const keuze = gekozen ?? beste;
    const [a, b] = keuze ? bereik(keuze) : [doel, doel];
    const ruimte = doel < a ? a - doel : doel > b ? b - doel : 0;
    const oordeel: Oordeel = ruimte === 0 ? "goed" : ruimte >= 2 ? "te-ruim" : ruimte > 0 ? "ruim" : ruimte <= -2 ? "krap" : "nauw";
    return { maat: beste, oordeel, ruimte, geschat: m.geschat.schoenmaat };
  }

  if (systeem === "kind") {
    // kindermaten heten naar de lichaamslengte; een maat past tot net onder 6 cm erboven,
    // op de grens kies je de volgende (groeiruimte)
    const nums = beschikbaar.map((s) => ({ s, n: parseFloat(s) })).filter((x) => !Number.isNaN(x.n)).sort((a, b) => a.n - b.n);
    const beste = nums.find((x) => l.lengte < x.n + 6)?.s ?? nums[nums.length - 1]?.s ?? null;
    const keuze = gekozen ?? beste;
    const n = keuze ? parseFloat(keuze) : l.lengte;
    const ruimte = n - l.lengte; // + = ruimer
    return { maat: beste, oordeel: oordeelUit(ruimte, 12), ruimte, geschat: false };
  }

  if (systeem === "hand") {
    // zonder handmaat: een schatting op silhouet en bouw
    const basis = l.silhouet === "dames" ? 1 : l.silhouet === "kind" ? 0 : 2; // S=0, M=1, L=2, XL=3
    const index = tussen(basis + (l.bouw === "stevig" ? 1 : l.bouw === "slank" ? -1 : 0) + (l.lengte > 190 ? 1 : 0), 0, 3);
    const volgorde = ["S", "M", "L", "XL"];
    const doel = volgorde[index] ?? "M";
    const beste = beschikbaar.includes(doel) ? doel : (beschikbaar[0] ?? null);
    const keuze = gekozen ?? beste;
    const stap = volgorde.indexOf(keuze ?? doel) - index;
    return { maat: beste, oordeel: stap === 0 ? "goed" : stap === 1 ? "ruim" : stap > 1 ? "te-ruim" : stap === -1 ? "nauw" : "krap", ruimte: stap * 2, geschat: true };
  }

  // lettermaten: borst (bovenkleding) of taille (broeken); "over" = over de jas heen
  const tabel = systeem === "onder" ? TAILLE[tabelSil] : BORST[tabelSil];
  const lijf = (systeem === "onder" ? m.taille : m.borst) + (systeem === "over" ? 8 : 0);
  const kandidaten = beschikbaar.filter((s) => tabel[s.toUpperCase()]);
  if (kandidaten.length === 0) return { maat: beschikbaar[0] ?? null, oordeel: "goed", ruimte: 0, geschat: true };
  const midden = (s: string) => {
    const [a, b] = tabel[s.toUpperCase()] ?? [0, 0];
    return (a + b) / 2;
  };
  const breedte = (s: string) => {
    const [a, b] = tabel[s.toUpperCase()] ?? [0, 0];
    return b - a;
  };
  const opVolgorde = [...kandidaten].sort((a, b) => midden(a) - midden(b));
  let index = opVolgorde.findIndex((s) => lijf <= (tabel[s.toUpperCase()]?.[1] ?? 0));
  if (index < 0) index = opVolgorde.length - 1;
  index = tussen(index + STAP[l.voorkeur], 0, opVolgorde.length - 1);
  const beste = opVolgorde[index] ?? null;
  const keuze = gekozen && tabel[gekozen.toUpperCase()] ? gekozen : beste;
  const ruimte = keuze ? midden(keuze) - lijf : 0;
  const geschat = systeem === "onder" ? m.geschat.taille : m.geschat.borst;
  return { maat: beste, oordeel: keuze ? oordeelUit(ruimte, breedte(keuze)) : "goed", ruimte: rond(ruimte), geschat };
}

// ---------------------------------------------------------------------------
// Kant-en-klare looks
// ---------------------------------------------------------------------------

export type Look = { id: string; titel: string; voor: Silhouet[]; slugs: string[] };

/** Looks uit de eigen catalogus; de paskamer laat een look weg als er minder dan twee stukken leverbaar zijn. */
export const LOOKS: Look[] = [
  { id: "bouwplaats", titel: "Bouwplaats", voor: ["heren", "dames"], slugs: ["veiligheidshelm", "veiligheidsbril-helder", "veiligheidshesje", "werk-tshirt-2pack", "werkbroek-kniezakken", "kniebeschermers", "werkhandschoenen-grip", "veiligheidsschoenen-s3"] },
  { id: "magazijn", titel: "Magazijn", voor: ["heren", "dames"], slugs: ["veiligheidshesje", "werk-tshirt-2pack", "werkbroek-kniezakken", "snijbestendige-handschoenen", "veiligheidssneakers-s1p"] },
  { id: "horeca", titel: "Horeca & keuken", voor: ["heren", "dames"], slugs: ["werk-tshirt-2pack", "chino-broek-zakelijk", "antislip-werkschoenen-ob"] },
  { id: "kantoor-heren", titel: "Kantoor", voor: ["heren"], slugs: ["business-overhemd-heren", "chino-broek-zakelijk", "zakelijk-riem-heren", "veiligheidssneakers-s1p"] },
  { id: "kantoor-dames", titel: "Kantoor", voor: ["dames"], slugs: ["business-blouse-dames", "chino-broek-zakelijk", "veiligheidssneakers-s1p"] },
  { id: "winter", titel: "Winterklaar", voor: ["heren", "dames"], slugs: ["zf-core-cap", "werk-tshirt-2pack", "winterpakket-bodywarmer-fleece", "thermo-broek-gevoerd", "shift-socks-2-pack", "veiligheidsschoenen-s3"] },
  { id: "weekend", titel: "Weekend", voor: ["heren", "dames"], slugs: ["zf-core-cap", "everyday-hoodie", "chino-broek-zakelijk", "workday-tote", "veiligheidssneakers-s1p"] },
  { id: "buiten", titel: "Buitenwerk", voor: ["heren", "dames"], slugs: ["field-overshirt", "werk-tshirt-2pack", "softshell-werkjas", "werkbroek-kniezakken", "veiligheidsschoenen-s3"] },
  { id: "kids", titel: "Kids", voor: ["kind"], slugs: ["zekerflex-kids-tshirt", "zf-core-cap"] },
];

/** Past dit product bij het silhouet? Kinderkleding alleen voor een kind, volwassenmaten niet voor een kind; one-size altijd. */
export function pastBijSilhouet(p: { gender?: string | null; systeem: Maatsysteem }, s: Silhouet): boolean {
  if (p.gender === "kinderen" || p.systeem === "kind") return s === "kind";
  if (s === "kind") return p.systeem === "geen" || p.systeem === "sok";
  return true;
}

// ---------------------------------------------------------------------------
// Producten voor de paskamer
// ---------------------------------------------------------------------------

export type PaskamerVariant = { id: string; size: string | null; color: string | null; priceCents: number | null; stock: number };
export type PaskamerProduct = {
  id: string;
  slug: string;
  name: string;
  priceCents: number;
  imageUrl: string | null;
  gender: string | null;
  seller: string | null;
  variants: PaskamerVariant[];
  pasvorm: Pasvorm;
};

/** Databaserij → paskamerproduct, of null als het niet te dragen of niet te kopen is. */
export function toPaskamerProduct(r: {
  id: string; slug: string; name: string; priceCents: number; imageUrl: string | null; gender: string | null;
  seller?: { name: string } | null;
  variants: PaskamerVariant[];
  /** door de Winkel-AI of de eigenaar vastgelegde soort (anders raden we uit de naam) */
  soort?: Soort | null;
}): PaskamerProduct | null {
  if (r.variants.length === 0) return null; // zonder variant valt er niets af te rekenen
  const firstColor = r.variants.find((v) => v.color)?.color ?? null;
  const pasvorm = pasvormVoor({ slug: r.slug, name: r.name, gender: r.gender, firstColor, soort: r.soort ?? null });
  if (!pasvorm) return null;
  return {
    id: r.id, slug: r.slug, name: r.name, priceCents: r.priceCents, imageUrl: r.imageUrl, gender: r.gender,
    seller: r.seller?.name ?? null,
    variants: r.variants.map((v) => ({ id: v.id, size: v.size, color: v.color, priceCents: v.priceCents, stock: v.stock })),
    pasvorm,
  };
}

/** De maten van een product op de volgorde die mensen verwachten (lettermaat, schoenmaat, kindermaat). */
export function matenVan(p: Pick<PaskamerProduct, "variants">, sorteer: (a: string, b: string) => number): string[] {
  return [...new Set(p.variants.map((v) => v.size).filter((s): s is string => Boolean(s)))].sort(sorteer);
}

/** De variant die bij maat en kleur hoort (null als die combinatie niet bestaat). */
export function kiesVariant(p: Pick<PaskamerProduct, "variants">, maat: string | null, kleur: string | null): PaskamerVariant | null {
  const heeftMaat = p.variants.some((v) => v.size);
  const heeftKleur = p.variants.some((v) => v.color);
  return p.variants.find((v) => (!heeftMaat || v.size === maat) && (!heeftKleur || v.color === kleur)) ?? null;
}
