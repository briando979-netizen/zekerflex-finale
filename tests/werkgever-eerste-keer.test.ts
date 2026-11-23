import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { nl } from "@/lib/i18n/dictionaries";
import { en } from "@/lib/i18n/dictionary-en";
import { REGELS_OPGEHEVEN_PRODUCTEN, RETENTION_RULES } from "@/lib/privacy/retention";

// De eerste keer in de werkgeversapp (22 nov 2026, gebruikersonderzoek B11/B14/B27): minder poorten vóór de eerste klus.
// De verificatieplicht (lib/company/verified.ts) blijft; alleen dubbele vragen en schermen gaan weg.

const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");

describe("kleine fouten (punt 15)", () => {
  it("aanmelden als bedrijf zegt niet 'Gratis voor werkers.'", () => {
    expect(lees("app/register/page.tsx")).toContain('...(defaultType === "bedrijf" ? { subtitle: t.subtitle } : {}),');
  });

  it("account verwijderen van een bedrijf noemt geen rijlessen, horecareserveringen of klantsites meer", () => {
    for (const k of REGELS_OPGEHEVEN_PRODUCTEN) expect(RETENTION_RULES.some((r) => r.key === k), k).toBe(true);
    const genoemd = RETENTION_RULES.filter((r) => !REGELS_OPGEHEVEN_PRODUCTEN.includes(r.key)).map((r) => r.label).join(" ");
    expect(genoemd).not.toMatch(/rijles|rijschool|horeca|klantsite/i);
    expect(lees("app/werkgever/account/verwijderen/page.tsx")).toContain("<ErasureScopeInfo verberg={REGELS_OPGEHEVEN_PRODUCTEN}");
    const info = lees("components/privacy/ErasureScopeInfo.tsx");
    expect(info).toContain("erasableNow().filter((r) => !verberg.includes(r.key))");
    expect(info).toContain("r.blocksErasure && !verberg.includes(r.key)");
  });
});

describe("rustiger werkgeversschermen (punt 14)", () => {
  it("de opbouwfase-melding staat alleen op het startscherm, niet meer in de layout", () => {
    expect(lees("app/werkgever/layout.tsx")).not.toContain("<OpbouwfaseBalk");
    expect(lees("app/werkgever/page.tsx")).toContain("<OpbouwfaseBalk />");
  });

  // 23 nov 2026 (eigenaar: de onboarding precies zoals YoungOnes): links het overzicht van alle stappen, rechts de groep waar je nu
  // bent met de stappen als uitklapbare rijen. Het besluit van 22 nov ("de stappen één keer") is daarmee vervangen.
  it("Jouw start heeft twee blokken naast elkaar: links het overzicht, rechts de uitklapbare stappen met de voortgang", () => {
    const wizard = lees("components/app/EmployerOnboardingWizard.tsx");
    expect(wizard).toContain("lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)]");
    expect(wizard).toContain("<nav aria-label={o.overzichtLabel}");
    expect(wizard).toContain('aria-labelledby="start-blok-kop"');
    expect(wizard).toContain("aria-expanded={isOpen}");
    expect(wizard).toContain('aria-current={nu ? "step" : undefined}');
    // de voortgang van de groep: stap x van y, het percentage en een balk in stukken
    for (const stuk of ["o.stapVan", "o.pctVoltooid", "o.minutenTeGaan", "blokVoortgang(gedaan)", "stapStanden(gedaan)"]) expect(wizard, stuk).toContain(stuk);
    // de volgorde van YoungOnes: organisatie, profiel, adres, omslagfoto (mag je overslaan), e-mail; daarna de vier van de eerste klus
    expect(wizard).toContain('const BLOK1: readonly Blok1Stap[] = ["org", "profiel", "adres", "omslag", "email"];');
    expect(wizard).toContain('const BLOK2: readonly Blok2Stap[] = ["klus", "reacties", "kiezen", "afronden"];');
    // elke rij en elke knop is minstens 44 px hoog
    expect(wizard).toContain("min-h-[3.75rem]");
    const knoppen = [...wizard.matchAll(/className="(btn-[^"]*)"/g)].map((x) => x[1] ?? "");
    expect(knoppen.length).toBeGreaterThanOrEqual(8);
    for (const k of knoppen) expect(k, k).toContain("min-h-11");
  });

  it("tijdens Jouw start staat er niets anders op het startscherm; het gewone startscherm komt pas als ook de eerste klus af is", () => {
    const start = lees("app/werkgever/page.tsx");
    expect(start).toContain("const showWizard = canOnboard && !berekenVoortgang(werkgeverStappen(startFeiten)).klaar;");
    expect(start).toContain("const startModus = showWizard;");
    expect(start).toContain("{!startModus && <OpbouwfaseBalk />}");
    expect(start).toContain("{!startModus && <WelcomeBack");
    expect(start).toContain("<PaginaKop title={t.start.welcomeTitle}");
  });

  it("de vragen over de organisatie zijn er weer alle vijf (de opslag bestond al), de omslagfoto is een stap die je mag overslaan", () => {
    const wizard = lees("components/app/EmployerOnboardingWizard.tsx");
    expect(wizard).toContain("const VRAGEN: readonly (typeof SELECT_KEYS)[number][] = SELECT_KEYS;");
    expect(wizard).toContain('fetch("/api/orgs/photo", { method: "POST", body: fd })');
    expect(wizard).toContain('f.set("coverStepDone", "1");');
    expect(wizard).toContain('f.set("profileStepDone", "1");');
    expect(lees("app/werkgever/page.tsx")).toContain("omslagKlaar: heeftOmslagfoto(extra),");
  });
});

// 23 nov 2026 (eigenaar: zoals YoungOnes): geen KVK-stap meer in Jouw start. Het adres van de werklocatie vraagt het bestaande
// formulier (PDOK-zoeker), en een werklocatie die er al is wordt alleen getoond. Het bedrijf en zijn nummers komen pas bij het inplannen.
describe("Jouw start: geen KVK-stap, wel het adres", () => {
  const wizard = lees("components/app/EmployerOnboardingWizard.tsx");

  it("de wizard heeft geen KVK-, land- of btw-velden en roept geen onboarding-actie voor het bedrijf aan", () => {
    for (const oud of ["KvkZoeker", "kvkNumber", "btwNummer", "registratieNummer", "employerOnboardingAction", "useFormState", "countryKnown"]) {
      expect(wizard, oud).not.toContain(oud);
    }
    expect(Object.hasOwn(nl.onboarding, "kvkNumber")).toBe(false);
  });

  it("een werklocatie die er al is: alleen tonen, met een link naar Locaties; anders het bestaande vestigingsformulier", () => {
    expect(wizard).toContain("{vestiging ? (");
    expect(wizard).toContain('href="/werkgever/locaties"');
    expect(wizard).toContain("<VestigingFormulier");
    expect(wizard).toContain("beginPlaats={concept?.city ?? \"\"}");
    const start = lees("app/werkgever/page.tsx");
    expect(start).toContain('where: { tenantId, kind: "PERMANENT" }');
    expect(start).toContain("vestiging: bestaandeVestiging ? { naam: bestaandeVestiging.name, adres: vestigingRegel(bestaandeVestiging) } : null");
    // het adres telt als gedaan zodra er een vaste werklocatie is, niet meer op een KVK-nummer
    expect(start).toContain("heeftVestiging(scope.tenantIds)");
    expect(start).not.toContain("isEmployerOnboarded");
  });

  it("twee blokken: Jij en je bedrijf, en Jouw eerste klus (YoungOnes-opzet, eigen woorden)", () => {
    expect(wizard).toContain("titel: o.blok1Titel");
    expect(wizard).toContain("titel: o.firstJobTitle");
    expect(wizard).toContain("werkgeverStappen(");
    expect(nl.onboarding.blok1Titel).toBe("Jij en je bedrijf");
    expect(nl.onboarding.firstJobTitle).toBe("Jouw eerste klus");
    // "Jouw eerste klus" staat er voor elk bedrijf, niet pas na een controle
    expect(wizard).not.toContain("initial.verified");
  });

  it("de teksten staan in het Nederlands en het Engels, met dezelfde sleutels en plaatshouders", () => {
    expect(Object.keys(en.onboarding).sort()).toEqual(Object.keys(nl.onboarding).sort());
    for (const k of ["blok1Titel", "blok1Intro", "voltooid", "stapVan", "minutenTeGaan", "pctVoltooid", "overzichtLabel", "klusBody", "reactiesNog", "reactiesEr", "kiezenBody", "afrondenBody", "fotoGelukt", "fotoMislukt", "fotoBezig", "adresIntro", "vestigingBekend", "vestigingWijzig", "klusLive", "naarKlussen", "aanDeSlag", "firstJobHint2", "firstJobHint3", "firstJobHint4"] as const) {
      expect(nl.onboarding[k].length, k).toBeGreaterThan(2);
      expect(en.onboarding[k].length, k).toBeGreaterThan(2);
      expect(en.onboarding[k], k).not.toBe(nl.onboarding[k]);
    }
    for (const sleutel of Object.keys(nl.laatsteChecks)) expect(Object.hasOwn(en.laatsteChecks, sleutel), sleutel).toBe(true);
    expect(Object.keys(en.laatsteChecks).sort()).toEqual(Object.keys(nl.laatsteChecks).sort());
  });
});
