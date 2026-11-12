import { describe, expect, it } from "vitest";
import { poortSamenvatting, poortStappen } from "@/lib/admin/werker-poort-weergave";
import { werkerOnboardingKlaar, type WerkerPoortFeiten } from "@/lib/onboarding/werker-poort";

const alles: WerkerPoortFeiten = {
  soortGekozen: true,
  branchesGekozen: true,
  gegevensIngevuld: true,
  identiteitIngestuurd: true,
  werkrechtIngevuld: true,
  tweestapAan: true,
  fotoGezet: true,
};

describe("de poort van de werker-app in Beheer", () => {
  it("toont precies de stappen die werkerOnboardingKlaar eist: alles af = klaar, één open = niet klaar", () => {
    expect(poortStappen(alles, "zzp").every((s) => s.ok)).toBe(true);
    expect(werkerOnboardingKlaar(alles)).toBe(true);
    for (const sleutel of ["soortGekozen", "branchesGekozen", "gegevensIngevuld", "identiteitIngestuurd", "tweestapAan", "fotoGezet"] as const) {
      const f = { ...alles, [sleutel]: false };
      expect(werkerOnboardingKlaar(f), sleutel).toBe(false);
      expect(poortStappen(f, "zzp").filter((s) => !s.ok)).toHaveLength(1);
    }
  });

  it("het werkrecht hoort niet bij de poort (sinds 10 nov), dus ook niet in het blok", () => {
    const f = { ...alles, werkrechtIngevuld: false };
    expect(werkerOnboardingKlaar(f)).toBe(true);
    expect(poortStappen(f, "zzp").every((s) => s.ok)).toBe(true);
  });

  it("legt per soort uit wat er bij de gegevens nog moet (uitzendkracht: BSN en overeenkomst)", () => {
    const f = { ...alles, gegevensIngevuld: false };
    const uitleg = (soort: Parameters<typeof poortStappen>[1]) => poortStappen(f, soort).find((s) => s.key === "gegevens")?.uitleg ?? "";
    expect(uitleg("uitzendkracht")).toMatch(/BSN/);
    expect(uitleg("uitzendkracht")).toMatch(/uitzendovereenkomst/);
    expect(uitleg("zzp")).toMatch(/KVK/);
    expect(uitleg("flexwerker")).toMatch(/KOR/);
    expect(uitleg(null)).toMatch(/Eerst kiezen/);
  });

  it("de ondertitel telt de open stappen in gewoon Nederlands", () => {
    expect(poortSamenvatting(poortStappen(alles, "zzp"))).toBe("Alles af: de werker ziet de hele app");
    expect(poortSamenvatting(poortStappen({ ...alles, fotoGezet: false }, "zzp"))).toBe("1 stap open: de werker ziet alleen de onboarding");
    expect(poortSamenvatting(poortStappen({ ...alles, fotoGezet: false, tweestapAan: false, gegevensIngevuld: false }, "uitzendkracht"))).toBe(
      "3 stappen open: de werker ziet alleen de onboarding",
    );
  });
});
