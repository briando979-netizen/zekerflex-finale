import { beforeEach, describe, expect, it } from "vitest";
import { REM_DUUR_MS, REM_NA, aiReviewOverslaan, aiReviewUitslag, resetAiReviewRem } from "@/lib/onboarding/ai-review-rem";

// De rem op de tekst-AI van de eigen ID-controle (12 nov 2026): gemeten 0 van 14 antwoorden sinds 9 nov, dus elke
// werker wachtte 8 s voor niets. Drie keer geen antwoord → 6 uur overslaan; daarna één poging.

const NU = Date.parse("2026-11-12T15:00:00+01:00");

beforeEach(() => resetAiReviewRem());

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
