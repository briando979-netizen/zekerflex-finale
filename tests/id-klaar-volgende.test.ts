import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { volgendeStapHref } from "@/lib/onboarding/volgende-stap";
import { poortStapVan, type WerkerPoortFeiten } from "@/lib/onboarding/werker-poort";
import { SCAN_EXTRA } from "@/lib/i18n/scan-extra";

// 13 nov 2026 (meting fd): 20 van de 24 werkers met een ID kwamen niet verder, omdat gegevens of branches nog open
// stonden. Het eindscherm van de ID-scan wijst nu naar de eerste open stap van de poort.
const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");
const alles: WerkerPoortFeiten = {
  soortGekozen: true, branchesGekozen: true, gegevensIngevuld: true, identiteitIngestuurd: true, fotoGezet: true,
  werkrechtIngevuld: true, tweestapAan: true,
} as WerkerPoortFeiten;

describe("na de ID-scan naar de volgende open stap", () => {
  it("de stap na de ID: gegevens, foto of branches, met de teller van de poort", () => {
    expect(poortStapVan({ ...alles, gegevensIngevuld: false, identiteitIngestuurd: true })).toMatchObject({ n: 3, totaal: 5, sleutel: "gegevens" });
    expect(poortStapVan({ ...alles, fotoGezet: false, identiteitIngestuurd: true })).toMatchObject({ n: 5, sleutel: "foto" });
    expect(poortStapVan({ ...alles, identiteitIngestuurd: true })).toBeNull();
  });

  it("elke stap heeft een eigen plek", () => {
    expect(volgendeStapHref("gegevens")).toBe("/dashboard/verificatie#gegevens-mist-kop");
    expect(volgendeStapHref("foto")).toBe("/dashboard/eerste-indruk?stap=foto");
    expect(volgendeStapHref("branches")).toBe("/dashboard/klussen");
    expect(volgendeStapHref("kind")).toBe("/dashboard/klussen");
  });

  it("de pagina rekent hem uit met de ID als ingestuurd, en het eindscherm gebruikt hem", () => {
    expect(bron("app/dashboard/verificatie/page.tsx")).toContain("naId={poort ? poortStapVan({ ...poort, identiteitIngestuurd: true }) : null}");
    const scan = bron("components/app/IdScan.tsx");
    expect(scan).toContain('window.location.assign(naId ? volgendeStapHref(naId.sleutel) : "/dashboard/klussen");');
    expect(scan).toContain("s.extra.volgendeKnop.replace(\"{stap}\", STAP_NAAM[naId.sleutel])");
    expect(bron("components/app/OnboardingForm.tsx")).toContain("naId={naId}");
  });

  it("de knoptekst in vijf talen, met {stap}", () => {
    for (const [taal, x] of Object.entries(SCAN_EXTRA)) {
      expect(x.volgendeKnop, taal).toContain("{stap}");
      if (taal !== "nl") expect(x.volgendeKnop, taal).not.toBe(SCAN_EXTRA.nl.volgendeKnop);
    }
  });
});
