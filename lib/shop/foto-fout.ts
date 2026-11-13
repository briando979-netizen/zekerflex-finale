// Waarom "Op mijn foto" kan mislukken, in een puur bestand (ook voor de test): per oorzaak krijgt de klant
// een eerlijke melding en altijd de uitweg om de maten zelf in te vullen.

export type FotoFout = "heic" | "niet-leesbaar" | "model" | "onbekend";

export class FotoFoutError extends Error {
  readonly soort: FotoFout;
  constructor(soort: FotoFout) {
    super(`foto-fout: ${soort}`);
    this.name = "FotoFoutError";
    this.soort = soort;
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
  onbekend: "pasFotoMislukt",
} as const satisfies Record<FotoFout, string>;