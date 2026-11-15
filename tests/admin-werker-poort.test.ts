import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { klusStappen, poortSamenvatting, poortStappen } from "@/lib/admin/werker-poort-weergave";
import type { KlusFeiten } from "@/lib/onboarding/klaar-voor-klus";
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
    for (const sleutel of ["soortGekozen", "branchesGekozen", "gegevensIngevuld", "identiteitIngestuurd", "fotoGezet"] as const) {
      const f = { ...alles, [sleutel]: false };
      expect(werkerOnboardingKlaar(f), sleutel).toBe(false);
      expect(poortStappen(f, "zzp").filter((s) => !s.ok && !s.optioneel)).toHaveLength(1);
    }
  });

  it("tweestapsverificatie staat erbij als optioneel en houdt reageren niet tegen (12 nov, eigenaar)", () => {
    const f = { ...alles, tweestapAan: false };
    expect(werkerOnboardingKlaar(f)).toBe(true);
    const stap = poortStappen(f, "zzp").find((s) => s.key === "tweestap");
    expect(stap).toMatchObject({ ok: false, optioneel: true });
    expect(stap?.label).toMatch(/optioneel/);
    expect(poortSamenvatting(poortStappen(f, "zzp"))).toBe("Alles af: de werker kan op klussen reageren");
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
    expect(poortSamenvatting(poortStappen(alles, "zzp"))).toBe("Alles af: de werker kan op klussen reageren");
    expect(poortSamenvatting(poortStappen({ ...alles, fotoGezet: false }, "zzp"))).toBe("1 stap open: de werker ziet de app, maar kan nog niet reageren");
    // tweestap telt niet mee: foto en gegevens zijn de twee open stappen
    expect(poortSamenvatting(poortStappen({ ...alles, fotoGezet: false, tweestapAan: false, gegevensIngevuld: false }, "uitzendkracht"))).toBe(
      "2 stappen open: de werker ziet de app, maar kan nog niet reageren",
    );
  });
});

describe("Vóór de eerste klus in Beheer (15 nov): dezelfde lijst als de werker ziet", () => {
  const klus: KlusFeiten = { soort: "uitzendkracht", payroll: true, idGoedgekeurd: true, bsn: true, contract: true, bedrijf: false, kvkWacht: false, iban: true, werkrechtOpen: false };

  it("uitzendkracht: BSN, overeenkomst, IBAN en ID goedgekeurd; zzp: KVK/btw/KOR, IBAN en ID", () => {
    expect(klusStappen(klus).map((r) => r.key)).toEqual(["bsn", "contract", "iban", "idGoedgekeurd"]);
    const zzp = { ...klus, soort: "zzp" as const, payroll: false };
    expect(klusStappen(zzp).map((r) => r.key)).toEqual(["bedrijf", "iban", "idGoedgekeurd"]);
    expect(klusStappen({ ...zzp, kvkWacht: true }).find((r) => r.key === "bedrijf")?.uitleg).toMatch(/controle bij de KVK wacht/);
    expect(klusStappen({ ...klus, werkrechtOpen: true }).some((r) => r.key === "werkrecht")).toBe(true);
    for (const r of klusStappen(klus)) expect(r.eersteKlus, r.key).toBe(true);
  });

  it("'Alles af: kan reageren' alleen als ook de lijst vóór de eerste klus af is", () => {
    const allesAf = [...poortStappen(alles, "uitzendkracht"), ...klusStappen(klus)];
    expect(poortSamenvatting(allesAf)).toBe("Alles af: de werker kan op klussen reageren");
    const zonderIban = [...poortStappen(alles, "uitzendkracht"), ...klusStappen({ ...klus, iban: false, idGoedgekeurd: false })];
    expect(poortSamenvatting(zonderIban)).toBe("2 stappen open: de werker ziet de app, maar kan nog niet reageren");
  });

  it("de beheerpagina toont de lijst onder een eigen kopje en telt een testaccount niet meer als 'geen poort'", () => {
    const pagina = readFileSync(join(process.cwd(), "app/admin/gebruikers/[id]/page.tsx"), "utf8");
    expect(pagina).toContain("...(klus ? klusStappen(klus) : [])");
    expect(pagina).toContain("Vóór de eerste klus");
    expect(pagina).not.toContain("Testaccount: geen poort");
  });
});
