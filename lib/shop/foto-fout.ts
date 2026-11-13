// Waarom "Op mijn foto" kan mislukken, in een puur bestand (ook voor de test): per oorzaak krijgt de klant
// een eerlijke melding en altijd de uitweg om de maten zelf in te vullen.

export type FotoFout = "heic" | "niet-leesbaar" | "model" | "csp" | "traag" | "onbekend";
/** Waar het misging: de foto inlezen, de modelbundel laden, de wasm/het model starten, of meten. */
export type FotoStap = "inlezen" | "bundel" | "wasm" | "meten";

export class FotoFoutError extends Error {
  readonly soort: FotoFout;
  readonly stap: FotoStap | null;
  readonly oorzaak: unknown;
  constructor(soort: FotoFout, stap: FotoStap | null = null, oorzaak?: unknown) {
    super(`foto-fout: ${soort}`);
    this.name = "FotoFoutError";
    this.soort = soort;
    this.stap = stap;
    this.oorzaak = oorzaak;
  }
}

/** Een iPhone-foto in HEIC/HEIF: Chrome, Firefox en Edge (en oude Safari) kunnen die niet lezen. */
export function isHeic(naam: string, type: string): boolean {
  return /^image\/hei[cf]/i.test(type) || /\.hei[cf]$/i.test(naam);
}

export function fotoFoutSoort(fout: unknown): FotoFout {
  return fout instanceof FotoFoutError ? fout.soort : "onbekend";
}

/** De sleutel van de melding in het woordenboek (paskamer.*). */
export const FOTO_FOUT_TEKST = {
  heic: "pasFotoHeic",
  "niet-leesbaar": "pasFotoNietLeesbaar",
  model: "pasFotoModel",
  csp: "pasFotoCsp",
  traag: "pasFotoTraag",
  onbekend: "pasFotoMislukt",
} as const satisfies Record<FotoFout, string>;
/** Zet een fout om in een FotoFoutError met de stap erbij; een fout met stap blijft zoals hij is. */
export function metStap(fout: unknown, stap: FotoStap, standaard: FotoFout = "onbekend"): FotoFoutError {
  if (fout instanceof FotoFoutError) return fout.stap ? fout : new FotoFoutError(fout.soort, stap, fout.oorzaak);
  // een CSP-blokkade van WebAssembly heeft een eigen soort: daar helpt een herlading, geen nieuwe foto
  return new FotoFoutError(standaard === "model" && isCspWasmFout(fout) ? "csp" : standaard, stap, fout);
}

/** Dezelfde belofte, maar na `ms` een FotoFoutError("traag") als hij nog niet klaar is. */
export function metTijdslimiet<T>(belofte: Promise<T>, ms: number, bijTijd?: () => void): Promise<T> {
  return new Promise<T>((ok, fout) => {
    const t = setTimeout(() => {
      bijTijd?.();
      fout(new FotoFoutError("traag", "wasm"));
    }, ms);
    belofte.then(
      (w) => {
        clearTimeout(t);
        ok(w);
      },
      (e) => {
        clearTimeout(t);
        fout(e);
      },
    );
  });
}

/**
 * De tekst voor het foutenlogboek: soort, stap, naam en bericht van de echte fout, afgekapt.
 * Geen foto, geen bestandsnaam, geen adressen of querystrings.
 */
export function foutRapport(fout: unknown): string {
  const e = fout instanceof FotoFoutError ? fout : metStap(fout, "meten");
  const echt = e.oorzaak ?? (e.soort === "onbekend" ? null : e);
  const naam = echt instanceof Error ? echt.name : typeof echt;
  const bericht = echt instanceof Error ? echt.message : typeof echt === "string" ? echt : "";
  const schoon = bericht
    .replace(/https?:\/\/\S+/gi, "<adres>")
    .replace(/\S+\.(jpe?g|png|heic|heif|webp|gif|avif)\b/gi, "<bestand>")
    .replace(/\s+/g, " ")
    .slice(0, 300);
  return `paskamer-foto soort=${e.soort} stap=${e.stap ?? "onbekend"} ${naam}: ${schoon}`.slice(0, 400);
}

/**
 * De browser blokkeerde WebAssembly door de CSP van de pagina ("WebAssembly.instantiate() violates CSP ... script-src").
 * Dat gebeurt als de paskamer via een client-navigatie werd geopend vanaf een pagina zonder 'wasm-unsafe-eval' (de CSP hoort bij
 * het eerste document). Een volledige paginalading lost het op. Alleen echte CSP-meldingen, geen andere wasm-fouten.
 */
export function isCspWasmFout(fout: unknown): boolean {
  const e = fout instanceof FotoFoutError ? fout.oorzaak : fout;
  const tekst = e instanceof Error ? `${e.name}: ${e.message}` : typeof e === "string" ? e : "";
  return /violates.{0,80}(CSP|Content Security Policy)|wasm-unsafe-eval|Content Security Policy/i.test(tekst) || (/CompileError/.test(tekst) && /WebAssembly\.instantiate/i.test(tekst) && /CSP|script-src/i.test(tekst));
}

export const CSP_HERLAAD_VLAG = "zf:paskamer-csp-herlaad";
export interface VlagOpslag {
  getItem(sleutel: string): string | null;
  setItem(sleutel: string, waarde: string): void;
}

/**
 * Mag de pagina nu EENMAAL herladen? Alleen bij een CSP-fout, alleen als de vlag er nog niet is, en alleen als de vlag
 * te zetten is (zonder werkende opslag zou het een lus worden: dan geen herlading maar een eerlijke melding).
 */
export function moetHerladen(csp: boolean, opslag: VlagOpslag | null): boolean {
  if (!csp || !opslag) return false;
  try {
    if (opslag.getItem(CSP_HERLAAD_VLAG)) return false;
    opslag.setItem(CSP_HERLAAD_VLAG, "1");
    return opslag.getItem(CSP_HERLAAD_VLAG) === "1";
  } catch {
    return false;
  }
}
