import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { binnenNederland, maakZoeklocatie } from "@/lib/worker/zoeklocatie-kern";
import { START_SCHERM_SINDS, startSchermTonen } from "@/lib/onboarding/werker-poort";
import { ERASABLE_KV_PREFIXES } from "@/lib/privacy/user-kv";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";
import { kvkAntwoordVan, nlPostcode, werkvormNaAntwoord, WERKVORMEN_MET_KVK } from "@/lib/onboarding/kvk-vraag";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

// 20 nov 2026: de start van een nieuwe werker als twee volschermstappen, zoals de app van YoungOnes (eigenaar: "precies
// zoals YoungOnes, alleen de chat blijft"): waar wil je klussen doen (plaats of huidige locatie), in welke branches.

const lees = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");

describe("zoeklocatie (puur)", () => {
  it("neemt een plaats in Nederland met een naam, afgerond op vijf decimalen", () => {
    expect(maakZoeklocatie({ lat: 52.3702157, lng: 4.8951679, label: "  Amsterdam " })).toEqual({ lat: 52.37022, lng: 4.89517, label: "Amsterdam" });
    expect(binnenNederland(53.2194, 6.5665)).toBe(true);
  });
  it("weigert wat geen plaats is: buiten Nederland, zonder naam, geen getallen, geen object", () => {
    expect(maakZoeklocatie({ lat: 48.8566, lng: 2.3522, label: "Parijs" })).toBeNull();
    expect(maakZoeklocatie({ lat: 52.37, lng: 4.9, label: "   " })).toBeNull();
    expect(maakZoeklocatie({ lat: "52.37", lng: 4.9, label: "Amsterdam" })).toBeNull();
    expect(maakZoeklocatie({ lat: Number.NaN, lng: 4.9, label: "Amsterdam" })).toBeNull();
    expect(maakZoeklocatie(null)).toBeNull();
    expect(maakZoeklocatie("Amsterdam")).toBeNull();
  });
  it("kapt een te lange naam af", () => {
    expect(maakZoeklocatie({ lat: 52.37, lng: 4.9, label: "x".repeat(300) })?.label.length).toBe(120);
  });
  it("valt onder het wissen van gegevens (AVG)", () => {
    expect(ERASABLE_KV_PREFIXES).toContain("werker-zoeklocatie:");
  });
});

describe("wie het startscherm ziet", () => {
  const nieuw = new Date(START_SCHERM_SINDS + 3_600_000);
  const oud = new Date(START_SCHERM_SINDS - 3_600_000);
  it("alleen een nieuw account dat nog geen branches koos en nog niet klaar is", () => {
    expect(startSchermTonen({ klaar: false, brancheKeuze: null }, nieuw)).toBe(true);
    expect(startSchermTonen({ klaar: false, brancheKeuze: { alle: true, branches: [] } }, nieuw)).toBe(false);
    expect(startSchermTonen({ klaar: true, brancheKeuze: null }, nieuw)).toBe(false);
    expect(startSchermTonen({ klaar: false, brancheKeuze: null }, oud)).toBe(false);
    expect(startSchermTonen({ klaar: false, brancheKeuze: null }, null)).toBe(false);
  });
  it("Ontdekken stuurt zo'n account door, de shell toont er geen balken, en de pagina bestaat", () => {
    expect(lees("app/dashboard/klussen/page.tsx")).toContain('if (poort && startSchermTonen(poort, poort.aangemeldOp)) redirect("/dashboard/start");');
    expect(lees("components/app/FreelancerShell.tsx")).toContain('pathname === "/dashboard/start"');
    const pagina = lees("app/dashboard/start/page.tsx");
    expect(pagina).toContain("<StartSchermen");
    expect(pagina).toContain('redirect("/dashboard/klussen")');
  });
  it("het scherm vraagt nooit vanzelf om de locatie en bewaart via de eigen routes", () => {
    const s = lees("components/app/StartSchermen.tsx");
    expect(s).toContain("navigator.geolocation.getCurrentPosition");
    expect(s).not.toMatch(/useEffect\([^)]*getCurrentPosition/);
    expect(s).toContain('fetch("/api/me/zoeklocatie"');
    expect(s).toContain('fetch("/api/me/branches"');
    expect(s).toContain('role="progressbar"');
    expect(s.match(/role="alert"/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    // alleen een client-veilig, puur bestand voor de vorm van de plaats
    expect(s).toContain('from "@/lib/worker/zoeklocatie-kern"');
    expect(s).not.toContain('from "@/lib/worker/zoeklocatie"');
  });
  it("de teksten in vijf talen", () => {
    for (const [taal, d] of Object.entries(FREELANCER_DICTS)) {
      for (const k of ["locatieUitleg", "locatieVerder", "locatiePlaceholder", "brancheTitel", "brancheProfielAan", "terugKnop", "kvkVraag", "kvkJa", "kvkJaUitleg", "kvkNee", "kvkNeeUitleg", "kvkSoort"] as const) {
        expect(d.start[k].length, `${taal} ${k}`).toBeGreaterThan(1);
        if (taal !== "nl" && !["terugKnop", "kvkNee"].includes(k)) expect(d.start[k], `${taal} ${k}`).not.toBe(FREELANCER_DICTS.nl.start[k]);
      }
      expect(d.start.locatieVerder).toContain("{plaats}");
      // "Flexwerker" stuurde wie geen KVK heeft nog naar Uitzendkracht: dat doet nu de vraag "Heb je een KVK-nummer?"
      expect(d.start.kinds.flexwerker[1], taal).not.toMatch(/Uitzendkracht|Agency worker|tymczasowy|temporar|Тимчасовий/);
    }
    // 22 nov 2026 (gebruikersonderzoek punt 6): "Verder", niet "Maak een profiel aan"
    expect(FREELANCER_DICTS.nl.start.brancheProfielAan).toBe("Verder");
  });
});

describe("één keer vragen, één voortgang (22 nov 2026, gebruikersonderzoek punt 6 en 7)", () => {
  it("de werkvorm als vraag: Nee = uitzendkracht, Ja = daarna zzp'er of flexwerker; de opgeslagen waarden blijven gelijk", () => {
    expect(werkvormNaAntwoord("nee", null)).toBe("uitzendkracht");
    expect(werkvormNaAntwoord("nee", "zzp")).toBe("uitzendkracht");
    expect(werkvormNaAntwoord("ja", null)).toBeNull();
    expect(werkvormNaAntwoord("ja", "zzp")).toBe("zzp");
    expect(werkvormNaAntwoord("ja", "flexwerker")).toBe("flexwerker");
    expect(werkvormNaAntwoord(null, "zzp")).toBeNull();
    expect(kvkAntwoordVan("uitzendkracht")).toBe("nee");
    expect(kvkAntwoordVan("flexwerker")).toBe("ja");
    expect(kvkAntwoordVan(null)).toBeNull();
    expect(WERKVORMEN_MET_KVK).toEqual(["zzp", "flexwerker"]);
  });

  it("herkent een Nederlandse postcode (die meteen de thuisbasis is)", () => {
    expect(nlPostcode("9712 hn")).toBe("9712HN");
    expect(nlPostcode(" 1011AB ")).toBe("1011AB");
    expect(nlPostcode("Groningen")).toBeNull();
    expect(nlPostcode("0123AB")).toBeNull();
    expect(nlPostcode("1234SS")).toBeNull();
  });

  it("het startscherm vraagt plaats, werkvorm en branches met de voortgang van de hele aanmelding, en 'Verder' gaat naar je gegevens", () => {
    const s = lees("components/app/StartSchermen.tsx");
    expect(s).toContain('fetch("/api/me/richting"');
    expect(s).toContain("POORT_STAPPEN.map((p, i)");
    expect(s).toContain("aria-valuemax={POORT_STAPPEN.length}");
    expect(s).toContain('router.push(doel === "profiel" ? "/dashboard/verificatie" : "/dashboard/klussen")');
    expect(s).not.toContain("#werker-start-titel");
    // een getypte postcode wordt ook de thuisbasis, via dezelfde route als "Bewaar en ga later verder"
    expect(s).toContain('body.set("identityMethod", "bewaren")');
    expect(lees("app/dashboard/start/page.tsx")).toContain("workerKind={fiscal?.workerKind ?? null}");
  });

  it("Je gegevens slaat 'Waar woon je?' over als de postcode al bekend is en er geen KVK-vraag is", () => {
    const f = lees("components/app/OnboardingForm.tsx");
    expect(f).toContain('setStap(woonKlaar && !requireKvk && stappen.includes("id") ? "id" : "woon");');
    expect(lees("app/dashboard/verificatie/page.tsx")).toContain("woonKlaar={woonKlaar}");
  });

  it("de knop Digitale ID-wallet staat alleen bij de ID-check, buiten het formulier (hij heeft een eigen <form>)", () => {
    const pagina = lees("app/dashboard/verificatie/page.tsx");
    expect(pagina).toContain("wallet={walletAan ? <WalletVerifyButton requireKvk={!isUitzend} /> : null}");
    expect(pagina.match(/<WalletVerifyButton/g)).toHaveLength(1);
    const f = lees("components/app/OnboardingForm.tsx");
    const knop = f.indexOf('{stap === "id" && wallet ?');
    expect(knop).toBeGreaterThan(f.indexOf("</form>"));
  });
});
