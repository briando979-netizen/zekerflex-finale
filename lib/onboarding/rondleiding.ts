// ---------------------------------------------------------------------------
// De rondleiding door de werker-app (12 nov 2026, eigenaar: "handleiding met de stappen waar en hoe alles werkt,
// met dat je volgende kan klikken of overslaan, na je eerste sessie"). Puur bestand: de stappen en wanneer hij
// verschijnt. Het scherm staat in components/app/WerkerRondleiding.tsx, de teksten in lib/i18n/freelancer.ts
// (rondleiding, vijf talen).
//
// "Na je eerste sessie": de eerste keer dat de app opent, bewaren we alleen het tijdstip (in de browser); komt de
// werker een half uur of later terug, dan verschijnt de rondleiding één keer. Overslaan of afronden telt als gezien.
// Opnieuw bekijken kan altijd via het vraagteken (Hulp).
// ---------------------------------------------------------------------------

/** in de browser (localStorage), per toestel: een gemak, geen gegevens die ergens anders nodig zijn */
export const RONDLEIDING_KEY = "zf-rondleiding-v1";
/** venster-event waarmee Hulp de rondleiding opnieuw start */
export const RONDLEIDING_START = "zf-rondleiding-start";
/** zo lang na het eerste bezoek telt een bezoek als een volgende sessie */
export const NA_EERSTE_SESSIE_MS = 30 * 60_000;

/** de stappen; een stap met een plek in de app wijst die aan via data-rondleiding="<stap>" */
export const RONDLEIDING_STAPPEN = ["welkom", "discover", "myJobs", "hours", "chat", "account", "hulp"] as const;
export type RondleidingStap = (typeof RONDLEIDING_STAPPEN)[number];

export interface RondleidingStand {
  /** het eerste bezoek (ms sinds 1970) */
  eerste?: number;
  /** overgeslagen of afgerond */
  gezien?: boolean;
}

/** Leest de bewaarde stand; alles wat niet klopt telt als "nog niets". */
export function leesRondleidingStand(ruw: string | null | undefined): RondleidingStand {
  if (!ruw) return {};
  try {
    const v = JSON.parse(ruw) as unknown;
    if (!v || typeof v !== "object") return {};
    const o = v as Record<string, unknown>;
    return {
      ...(typeof o.eerste === "number" && Number.isFinite(o.eerste) ? { eerste: o.eerste } : {}),
      ...(o.gezien === true ? { gezien: true } : {}),
    };
  } catch {
    return {};
  }
}

/**
 * Moet de rondleiding nu verschijnen, en wat moet er bewaard worden? Eerste bezoek: niet tonen, het tijdstip bewaren.
 * Later bezoek (na een half uur of meer): tonen. Al gezien: nooit meer vanzelf.
 */
export function rondleidingBeslissing(stand: RondleidingStand, nu: number): { toon: boolean; bewaar: RondleidingStand | null } {
  if (stand.gezien) return { toon: false, bewaar: null };
  if (stand.eerste === undefined) return { toon: false, bewaar: { eerste: nu } };
  return { toon: nu - stand.eerste >= NA_EERSTE_SESSIE_MS, bewaar: null };
}
