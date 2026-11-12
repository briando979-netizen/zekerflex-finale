import { beforeEach, describe, expect, it, vi } from "vitest";

// de database (KV) als gewone Map: de rem moet een uitrol overleven
const kv = vi.hoisted(() => ({ rijen: new Map<string, unknown>(), stuk: false }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => {
    if (kv.stuk) throw new Error("database weg");
    return kv.rijen.get(k) ?? null;
  },
  kvSet: async (k: string, v: unknown) => {
    if (kv.stuk) throw new Error("database weg");
    kv.rijen.set(k, v);
  },
}));

import { REM_DUUR_MS, REM_KV_SLEUTEL, REM_NA, aiReviewOverslaan, aiReviewUitslag, laadAiReviewRem, resetAiReviewRem } from "@/lib/onboarding/ai-review-rem";

// De rem op de tekst-AI van de eigen ID-controle (12 nov 2026): gemeten 0 van 14 antwoorden sinds 9 nov, dus elke
// werker wachtte 8 s voor niets. Drie keer geen antwoord → 6 uur overslaan; daarna één poging.

const NU = Date.parse("2026-11-12T15:00:00+01:00");

beforeEach(() => {
  resetAiReviewRem();
  kv.rijen.clear();
  kv.stuk = false;
});

/** de stand gaat los (fire-and-forget) naar de database: even wachten tot die er staat */
const naDatabase = () => new Promise((klaar) => setTimeout(klaar, 0));

describe("de rem overleeft een uitrol (12 nov: na elke uitrol wachtte elke werker weer 8 s)", () => {
  it("dicht vóór de uitrol blijft dicht erna", async () => {
    await laadAiReviewRem();
    for (let i = 0; i < REM_NA; i++) aiReviewUitslag(false, NU);
    await naDatabase();
    expect(kv.rijen.get(REM_KV_SLEUTEL)).toEqual({ mislukt: 0, dichtTot: NU + REM_DUUR_MS });

    resetAiReviewRem(); // nieuwe container: het geheugen is leeg, de database niet
    expect(aiReviewOverslaan(NU + 60_000)).toBe(false); // zonder laden weet hij het niet...
    resetAiReviewRem();
    await laadAiReviewRem();
    expect(aiReviewOverslaan(NU + 60_000)).toBe(true); // ...met laden wel
  });

  it("twee mislukte pogingen vóór de uitrol: de derde erna sluit hem", async () => {
    await laadAiReviewRem();
    aiReviewUitslag(false, NU);
    aiReviewUitslag(false, NU);
    await naDatabase();
    resetAiReviewRem();
    await laadAiReviewRem();
    expect(aiReviewOverslaan(NU)).toBe(false);
    expect(aiReviewUitslag(false, NU)).toBe("dicht");
  });

  it("een database die niet antwoordt blokkeert niets: dan alleen de rem in het geheugen", async () => {
    kv.stuk = true;
    await expect(laadAiReviewRem()).resolves.toBeUndefined();
    expect(aiReviewOverslaan(NU)).toBe(false);
    for (let i = 0; i < REM_NA; i++) aiReviewUitslag(false, NU);
    await naDatabase();
    expect(aiReviewOverslaan(NU + 1)).toBe(true);
  });

  it("een rare waarde in de database maakt de rem niet stuk", async () => {
    kv.rijen.set(REM_KV_SLEUTEL, { mislukt: 99, dichtTot: "morgen" });
    await laadAiReviewRem();
    expect(aiReviewOverslaan(NU)).toBe(false);
    expect(aiReviewUitslag(false, NU)).toBe("dicht"); // hooguit REM_NA - 1 meegenomen
  });
});

describe("rem op de tekst-AI", () => {
  it("pas na drie mislukte pogingen achter elkaar overslaan, en dan meldt hij het één keer", () => {
    expect(aiReviewOverslaan(NU)).toBe(false);
    expect(aiReviewUitslag(false, NU)).toBeNull();
    expect(aiReviewUitslag(false, NU)).toBeNull();
    expect(aiReviewOverslaan(NU)).toBe(false);
    expect(aiReviewUitslag(false, NU)).toBe("dicht");
    expect(REM_NA).toBe(3);
    expect(aiReviewOverslaan(NU + 60_000)).toBe(true);
    expect(aiReviewOverslaan(NU + REM_DUUR_MS - 1)).toBe(true);
  });

  it("een antwoord tussendoor zet de teller op nul", () => {
    aiReviewUitslag(false, NU);
    aiReviewUitslag(false, NU);
    expect(aiReviewUitslag(true, NU)).toBeNull();
    expect(aiReviewUitslag(false, NU)).toBeNull();
    expect(aiReviewUitslag(false, NU)).toBeNull();
    expect(aiReviewOverslaan(NU)).toBe(false);
  });

  it("na 6 uur één nieuwe poging: mislukt die, dan meteen weer dicht; lukt die, dan weer gewoon", () => {
    for (let i = 0; i < REM_NA; i++) aiReviewUitslag(false, NU);
    const later = NU + REM_DUUR_MS + 1;
    expect(aiReviewOverslaan(later)).toBe(false);
    expect(aiReviewUitslag(false, later)).toBe("dicht");
    expect(aiReviewOverslaan(later + 1)).toBe(true);

    resetAiReviewRem();
    for (let i = 0; i < REM_NA; i++) aiReviewUitslag(false, NU);
    expect(aiReviewOverslaan(later)).toBe(false);
    expect(aiReviewUitslag(true, later)).toBeNull();
    expect(aiReviewUitslag(false, later)).toBeNull();
    expect(aiReviewOverslaan(later)).toBe(false);
  });
});
