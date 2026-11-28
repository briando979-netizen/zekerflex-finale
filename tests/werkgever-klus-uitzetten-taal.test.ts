import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { nl } from "@/lib/i18n/dictionaries";
import { en } from "@/lib/i18n/dictionary-en";

// Gewone taal op "Klus uitzetten", de klussenlijst en Favorieten (20 nov 2026):
// - een bedrijf zonder vestiging leest dat we het adres nodig hebben (geen "onboarding") en vult het sinds 22 nov meteen daar in;
// - boven "Klussen" staat geen los vakwoord meer ("Bezetting");
// - een pool heet in het Nederlands een groep; het Engels blijft "pool";
// - de knop heet overal "Klus uitzetten".

const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");

describe("klus uitzetten zonder vestiging", () => {
  it("zegt in gewone taal dat het adres nodig is", () => {
    expect(nl.newShift.noBranches).toMatch(/adres van je bedrijf/);
    expect(nl.newShift.noBranches).toMatch(/in de buurt/);
    for (const tekst of [nl.newShift.noBranches, nl.newShift.addAddress, nl.newShift.askAdmin]) {
      expect(tekst).not.toMatch(/onboarding|vestiging|organisatie/i);
    }
    expect(en.newShift.noBranches).not.toMatch(/onboarding/i);
    expect(en.newShift.addAddress.length).toBeGreaterThan(3);
  });

  // 22 nov 2026 (gebruikersonderzoek B14–B19): niet meer via Locaties en terug, maar het adres meteen hier in één scherm
  it("een beheerder vult het adres meteen op Klus uitzetten in", () => {
    const src = lees("app/werkgever/diensten/nieuw/page.tsx");
    expect(src).toContain("<EersteVestiging metBelgie={metBelgie} />");
    expect(src).not.toContain('href="/werkgever"');
    // wie geen beheerder is kan daar niets toevoegen: die krijgt uitleg in plaats van een formulier dat geweigerd wordt
    expect(src).toContain("n.askAdmin");
    expect(src).toMatch(/hasRole\(principal, "HQ_ADMIN", "PLATFORM_ADMIN"\)\s*\?\s*\(\s*<EersteVestiging metBelgie=\{metBelgie\} \/>/);
    const eerste = lees("components/werkgever/EersteVestiging.tsx");
    expect(eerste).toContain("{t.waarKop}");
    expect(eerste).toContain("{t.noBranches}");
    // na het opslaan laadt de pagina opnieuw: dan staat het klusformulier er
    expect(eerste).toContain("router.refresh()");
    expect(nl.newShift.waarKop).toBe("Waar is het werk?");
    expect(en.newShift.waarKop.length).toBeGreaterThan(3);
  });

  it("Locaties laat een beheerder echt een vestiging toevoegen", () => {
    expect(lees("app/werkgever/locaties/page.tsx")).toContain("<BranchesBoard");
    expect(lees("components/app/BranchesBoard.tsx")).toContain('fetch("/api/werkgever/branches", {');
  });
});

describe("klussenlijst", () => {
  it("heeft geen klein vakwoord boven de kop", () => {
    expect("eyebrow" in nl.shifts).toBe(false);
    expect("eyebrow" in en.shifts).toBe(false);
    expect(lees("app/werkgever/diensten/page.tsx")).not.toContain("eyebrow=");
  });

  it("de knop heet overal Klus uitzetten", () => {
    for (const tekst of [nl.shifts.placeShift, nl.favorites.placeShift, nl.calendar.placeShift, nl.start.placeShift, nl.newShift.title, nl.werkruimteStart.klusPlaatsen]) {
      expect(tekst).toBe("Klus uitzetten");
    }
    // ook in een zin: uitzetten, niet plaatsen
    expect(nl.werkgeverStart.plaatsDienst).toBe("Zet een klus uit →");
    expect(nl.onboarding.firstJob1).toBe("Zet je eerste klus uit");
    expect(nl.onboarding.placeFirst).toBe("Zet je eerste klus uit");
    for (const f of ["app/werkgever/diensten/page.tsx", "app/werkgever/diensten/nieuw/page.tsx"]) {
      expect(lees(f)).not.toMatch(/Klus plaatsen|Dienst plaatsen/);
    }
  });
});

describe("groepen favorieten", () => {
  it("in het Nederlands heet een pool een groep", () => {
    expect(nl.pools.manage).toBe("Groepen beheren");
    for (const tekst of Object.values(nl.pools)) expect(tekst).not.toMatch(/pool/i);
    for (const tekst of [nl.newShiftForm.poolUitleg, nl.poolPubliceer.kop, nl.poolPubliceer.uitleg, nl.settings.cLabelsS]) {
      expect(tekst).not.toMatch(/pool/i);
    }
  });

  it("het Engels blijft pool en heeft dezelfde sleutels", () => {
    expect(en.pools.manage).toBe("Manage pools");
    expect(Object.keys(en.pools).sort()).toEqual(Object.keys(nl.pools).sort());
    // de invulling in de vraag bij verwijderen staat in beide talen
    expect(nl.pools.deleteConfirm).toContain("{naam}");
    expect(en.pools.deleteConfirm).toContain("{naam}");
  });

  it("de schermen halen hun tekst uit het woordenboek", () => {
    expect(lees("app/werkgever/favorieten/page.tsx")).toContain("{t.pools.manage}");
    expect(lees("app/werkgever/favorieten/page.tsx")).not.toContain("Pools beheren");
    const pagina = lees("app/werkgever/favorieten/pools/page.tsx");
    expect(pagina).toContain("title={t.pools.title}");
    expect(pagina).not.toMatch(/Favoriete pools|pools kunt maken/);
    const beheer = lees("components/app/PoolsManager.tsx");
    expect(beheer).toContain("useT().pools");
    expect(beheer).not.toMatch(/Pool aanmaken|Nog geen pools|voor deze pool/);
    // een clientbestand haalt het Engelse woordenboek nooit zelf binnen
    expect(beheer).not.toMatch(/dictionary-en|i18n\/server/);
    const acties = lees("app/werkgever/favorieten/pools/actions.ts");
    expect(acties).not.toMatch(/"Pool [a-z]+\."|de pool\./);
  });

  it("de fouten uit de opslag komen in de taal van de werkgever", () => {
    expect(nl.pools.notFound).toBe("Groep niet gevonden.");
    expect(nl.pools.nameRequired).toBe("Geef de groep een naam.");
    expect(en.pools.notFound).toBe("Pool not found.");
    const acties = lees("app/werkgever/favorieten/pools/actions.ts");
    expect(acties).toContain("if (err.status === 404) return p.notFound;");
    expect(acties).toContain("if (err.status === 422) return p.nameRequired;");
    expect(acties).not.toContain("message: err.message }");
  });
});
