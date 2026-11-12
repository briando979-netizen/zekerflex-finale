// ---------------------------------------------------------------------------
// Live begeleiding van de camera bij de ID-scan (12 nov 2026, wens eigenaar: "zoals Stripe het doet"). Puur bestand,
// voor de browser (components/app/IdScan.tsx) en de tests: geen DOM, geen netwerk.
//
// Document: de browser meet zelf op een kleine uitsnede van het kader of het beeld scherp, stil, licht genoeg en
// zonder glans is. Pas dan vraagt hij de server (POST /api/onboarding/document-live) of de code onderaan (MRZ)
// leesbaar is, of hoe groot de pasfoto op het document in beeld staat. Daaruit volgen de aanwijzingen
// ("Kom iets dichterbij", "Houd de camera iets verder weg") en het moment waarop de foto vanzelf wordt gemaakt.
// Selfie: dezelfde soort aanwijzingen uit de bestaande gezichtsmeting (lib/kyc/gezicht/beweging.ts), plus "verder
// weg" en "stilhouden"; na een paar goede beelden achter elkaar maakt de camera de foto vanzelf.
// De drempels zijn een eerste instelling, niet gemeten op echte gevallen: de knop blijft daarom altijd als uitweg.
// ---------------------------------------------------------------------------

import { rechtAanwijzing, type LiveAanwijzing, type LiveMeting } from "@/lib/kyc/gezicht/beweging";

export const DOC_LIVE = {
  /** breedte van de uitsnede waarop de browser meet (pixels) */
  meetBreedte: 320,
  /** variantie van de Laplace-operator op de grijze uitsnede: daaronder is het beeld onscherp */
  minScherpte: 90,
  /** aandeel bijna witte pixels (≥ 250) in het kader: daarboven is er glans */
  maxGlans: 0.04,
  /** gemiddelde helderheid (0–255): daaronder is het te donker */
  minLicht: 45,
  /** gemiddeld verschil (0–255) tussen twee kleine opeenvolgende beelden: daaronder staat het stil */
  maxBeweging: 4,
  /** zoveel stille, scherpe beelden achter elkaar voor de browser de server vraagt */
  stilBeelden: 2,
  /** hoogstens zo vaak de server vragen (ms) */
  serverPauze: 1100,
} as const;

/** De pasfoto op het document, als deel van de breedte van het kader, als het document het kader goed vult. */
export const PORTRET = {
  /** ID-kaart en rijbewijs (ID-1-formaat): het gezicht op de pasfoto is ±0,18–0,26 van de kaartbreedte */
  kaart: { min: 0.13, max: 0.34 },
  /** paspoort (TD3): de pagina is breder, het gezicht op de pasfoto ±0,12–0,15 van het kader */
  paspoort: { min: 0.09, max: 0.26 },
} as const;

export const SELFIE_LIVE = {
  /** daarboven is het gezicht te groot in beeld: "houd de camera iets verder weg" */
  maxBreedteDeel: 0.62,
  /** zoveel goede beelden achter elkaar, dan maakt de camera de selfie vanzelf */
  goedeBeelden: 3,
  /** zo weinig mag het hoofd tussen twee beelden bewegen om als stil te tellen */
  maxDraaiVerschil: 0.035,
  maxBreedteVerschil: 0.035,
} as const;

export type DocSoortLive = "PASSPORT" | "ID_CARD" | "DRIVERS_LICENSE";
export type DocKant = "voor" | "achter";

/** Wat de server voor deze kant kan meten: de code onderaan (MRZ) en/of de pasfoto. */
export interface DocKantMeting {
  mrz: boolean;
  portret: boolean;
}

/** Paspoort: code en pasfoto op de fotopagina. ID-kaart: pasfoto voor, code achter. Rijbewijs: pasfoto voor, achter niets. */
export function docKantMeting(soort: DocSoortLive, kant: DocKant): DocKantMeting {
  if (soort === "PASSPORT") return { mrz: true, portret: true };
  if (soort === "ID_CARD") return kant === "voor" ? { mrz: false, portret: true } : { mrz: true, portret: false };
  return kant === "voor" ? { mrz: false, portret: true } : { mrz: false, portret: false };
}

export interface Rechthoek {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Het kader op het scherm (`kaderBreedte` van de breedte, verhouding `kaderVerhouding`, gecentreerd) in pixels van
 * het videobeeld. De video vult het vak met object-cover: er valt dus aan twee kanten iets weg.
 */
export function kaderInVideo(videoB: number, videoH: number, opts: { vakVerhouding?: number; kaderBreedte?: number; kaderVerhouding?: number } = {}): Rechthoek | null {
  if (!(videoB > 0) || !(videoH > 0)) return null;
  const vak = opts.vakVerhouding ?? 3 / 4;
  const kb = opts.kaderBreedte ?? 0.88;
  const kv = opts.kaderVerhouding ?? 1.586;
  // het zichtbare deel van de video (object-cover): even breed/hoog als het vak
  const videoVerh = videoB / videoH;
  const zichtB = videoVerh > vak ? videoH * vak : videoB;
  const zichtH = videoVerh > vak ? videoH : videoB / vak;
  const w = zichtB * kb;
  const h = w / kv;
  const x = (videoB - w) / 2;
  const y = (videoH - h) / 2;
  return { x: Math.round(x), y: Math.round(y), w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
}

/** Luminantie (0–255) per pixel uit RGBA. */
export function grijs(rgba: ArrayLike<number>, breedte: number, hoogte: number): Uint8Array {
  const n = breedte * hoogte;
  const uit = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const r = rgba[i * 4] ?? 0;
    const g = rgba[i * 4 + 1] ?? 0;
    const b = rgba[i * 4 + 2] ?? 0;
    uit[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }
  return uit;
}

/** Scherpte: de variantie van de Laplace-operator (4 buren). Hoger = scherper. */
export function scherpte(g: ArrayLike<number>, breedte: number, hoogte: number): number {
  if (breedte < 3 || hoogte < 3) return 0;
  let som = 0;
  let somKw = 0;
  let n = 0;
  for (let y = 1; y < hoogte - 1; y++) {
    for (let x = 1; x < breedte - 1; x++) {
      const i = y * breedte + x;
      const v = 4 * (g[i] ?? 0) - (g[i - 1] ?? 0) - (g[i + 1] ?? 0) - (g[i - breedte] ?? 0) - (g[i + breedte] ?? 0);
      som += v;
      somKw += v * v;
      n++;
    }
  }
  if (n === 0) return 0;
  const gem = som / n;
  return somKw / n - gem * gem;
}

/** Gemiddelde helderheid en het aandeel bijna witte pixels (glans). */
export function licht(g: ArrayLike<number>): { gemiddeld: number; glans: number } {
  const n = g.length;
  if (n === 0) return { gemiddeld: 0, glans: 0 };
  let som = 0;
  let wit = 0;
  for (let i = 0; i < n; i++) {
    const v = g[i] ?? 0;
    som += v;
    if (v >= 250) wit++;
  }
  return { gemiddeld: som / n, glans: wit / n };
}

/** Verkleint een grijs beeld met blokgemiddelden (`factor` × `factor`): minder ruis voor het meten van beweging. */
export function verklein(g: ArrayLike<number>, breedte: number, hoogte: number, factor: number): Uint8Array {
  const f = Math.max(1, Math.floor(factor));
  const b = Math.max(1, Math.floor(breedte / f));
  const h = Math.max(1, Math.floor(hoogte / f));
  const uit = new Uint8Array(b * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < b; x++) {
      let som = 0;
      let n = 0;
      for (let dy = 0; dy < f; dy++) {
        const rij = (y * f + dy) * breedte;
        for (let dx = 0; dx < f; dx++) {
          const i = rij + x * f + dx;
          if (i < g.length) {
            som += g[i] ?? 0;
            n++;
          }
        }
      }
      uit[y * b + x] = n ? Math.round(som / n) : 0;
    }
  }
  return uit;
}

/** Gemiddeld verschil tussen twee even grote grijze beelden; Infinity als ze niet te vergelijken zijn. */
export function beweging(a: ArrayLike<number> | null, b: ArrayLike<number>): number {
  if (!a || a.length !== b.length || b.length === 0) return Infinity;
  let som = 0;
  for (let i = 0; i < b.length; i++) som += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
  return som / b.length;
}

export interface BeeldMeting {
  scherpte: number;
  gemiddeld: number;
  glans: number;
  /** verschil met het vorige beeld (Infinity bij het eerste) */
  beweging: number;
}

/** Wat de server terugzegt (alleen ja/nee en een getal, nooit de inhoud van de code). */
export interface DocServerMeting {
  /** null = niet gemeten (deze kant heeft geen code) */
  leesbaar: boolean | null;
  /** het gezicht op de pasfoto als deel van de kaderbreedte; null = geen gezicht gevonden of niet gemeten */
  portret: number | null;
}

export type DocAanwijzing = "licht" | "glans" | "stil" | "dichterbij" | "verder" | "code" | "zoeken" | "goed";

/** De browser zelf: is het beeld goed genoeg om de server te vragen? Zo niet, welke aanwijzing? */
export function beeldAanwijzing(m: BeeldMeting): DocAanwijzing | null {
  if (m.gemiddeld < DOC_LIVE.minLicht) return "licht";
  if (m.glans > DOC_LIVE.maxGlans) return "glans";
  if (m.beweging > DOC_LIVE.maxBeweging || m.scherpte < DOC_LIVE.minScherpte) return "stil";
  return null;
}

/** De pasfoto: te klein (verder weg dan nodig), te groot (te dichtbij), of goed. */
export function portretAanwijzing(soort: DocSoortLive, breedteDeel: number | null): "dichterbij" | "verder" | "zoeken" | "goed" {
  if (breedteDeel === null || !Number.isFinite(breedteDeel)) return "zoeken";
  const r = soort === "PASSPORT" ? PORTRET.paspoort : PORTRET.kaart;
  if (breedteDeel < r.min) return "dichterbij";
  if (breedteDeel > r.max) return "verder";
  return "goed";
}

/**
 * Na het antwoord van de server: maakt de camera nu de foto ("goed"), of welke aanwijzing? Een kant met een code
 * gaat alleen vanzelf als de code leesbaar is; een kant met alleen een pasfoto als die goed in het kader staat.
 * Een kant zonder code en pasfoto (achterkant rijbewijs) gaat nooit vanzelf: dan de knop.
 */
export function serverAanwijzing(soort: DocSoortLive, kant: DocKantMeting, s: DocServerMeting): DocAanwijzing {
  const p = kant.portret ? portretAanwijzing(soort, s.portret) : null;
  if (kant.mrz) {
    if (s.leesbaar === true) return "goed";
    // de pasfoto geeft de afstand; zonder pasfoto (achterkant ID-kaart) alleen "de code in beeld"
    if (p === "dichterbij" || p === "verder") return p;
    return "code";
  }
  if (kant.portret) return p === "goed" ? "goed" : (p ?? "zoeken");
  return "stil";
}

/** Kan deze kant vanzelf worden vastgelegd (heeft de server iets te meten)? */
export function kanVanzelf(kant: DocKantMeting): boolean {
  return kant.mrz || kant.portret;
}

// ---- selfie -----------------------------------------------------------------

export type SelfieAanwijzing = LiveAanwijzing | "verder" | "stil";

/** De eerste selfie: de bestaande aanwijzingen, plus "verder weg" als het gezicht te groot in beeld staat. */
export function selfieAanwijzing(m: LiveMeting | null): SelfieAanwijzing {
  const a = rechtAanwijzing(m);
  if (a === "goed" && m && m.breedteDeel > SELFIE_LIVE.maxBreedteDeel) return "verder";
  return a;
}

/** Staat het hoofd stil tussen twee goede metingen? */
export function selfieStil(vorige: LiveMeting | null, nu: LiveMeting | null): boolean {
  if (!vorige || !nu) return false;
  return Math.abs(nu.draaiing - vorige.draaiing) <= SELFIE_LIVE.maxDraaiVerschil && Math.abs(nu.breedteDeel - vorige.breedteDeel) <= SELFIE_LIVE.maxBreedteVerschil;
}

/**
 * Telt de goede, stille beelden achter elkaar. Geeft het nieuwe aantal terug; bij SELFIE_LIVE.goedeBeelden maakt de
 * camera de foto. Een beeld dat niet goed is of beweegt, zet de teller terug.
 */
export function telSelfie(teller: number, vorige: LiveMeting | null, nu: LiveMeting | null): number {
  if (selfieAanwijzing(nu) !== "goed") return 0;
  if (teller > 0 && !selfieStil(vorige, nu)) return 1;
  return teller + 1;
}
