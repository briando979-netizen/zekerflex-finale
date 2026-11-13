import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { verderKaart } from "@/lib/onboarding/verder-kaart";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";
import { SCAN_EXTRA } from "@/lib/i18n/scan-extra";
import { LOCALES } from "@/lib/i18n/config";
import { isMeetcode } from "@/lib/admin/werker-trechter-kern";
import type { WerkerPoortFeiten } from "@/lib/onboarding/werker-poort";

// Het eindscherm van /dashboard/verificatie zegt welke stap nog open staat en geeft een knop erheen (14 nov 2026: 12 van de
// 19 werkers met een ID stonden stil bij de branches, en het scherm zei alleen "Nog 1 stap te gaan!").

const af: WerkerPoortFeiten = { soortGekozen: true, branchesGekozen: true, gegevensIngevuld: true, identiteitIngestuurd: true, werkrechtIngevuld: true, tweestapAan: false, fotoGezet: true };
const nl = FREELANCER_DICTS.nl.start;

describe("verderKaart", () => {
  it("branches open: Stap 2 van 5, de naam en een knop naar de wizard bij Klussen", () => {
    expect(verderKaart({ ...af, branchesGekozen: false, fotoGezet: false }, nl, SCAN_EXTRA.nl.volgendeKnop)).toEqual({
      sleutel: "branches",
      teller: "Stap 2 van 5",
      naam: nl.brancheStep,
      uitleg: nl.brancheHint,
      knop: `Verder: ${nl.brancheStep}`,
      href: "/dashboard/klussen",
    });
  });

  it("gegevens of soort open: naar de goede plek", () => {
    expect(verderKaart({ ...af, gegevensIngevuld: false }, nl, SCAN_EXTRA.nl.volgendeKnop)?.href).toBe("/dashboard/verificatie#gegevens-mist-kop");
    expect(verderKaart({ ...af, soortGekozen: false, branchesGekozen: false }, nl, SCAN_EXTRA.nl.volgendeKnop)).toMatchObject({ sleutel: "kind", teller: "Stap 1 van 5" });
  });

  it("geen kaart als alles af is, alleen de foto open staat (die heeft een eigen kaart) of zonder poortfeiten", () => {
    expect(verderKaart(af, nl, SCAN_EXTRA.nl.volgendeKnop)).toBeNull();
    expect(verderKaart({ ...af, fotoGezet: false }, nl, SCAN_EXTRA.nl.volgendeKnop)).toBeNull();
    expect(verderKaart(null, nl, SCAN_EXTRA.nl.volgendeKnop)).toBeNull();
  });

  it("in vijf talen, zonder overgebleven plaatshouders", () => {
    for (const taal of LOCALES) {
      const k = verderKaart({ ...af, branchesGekozen: false }, FREELANCER_DICTS[taal].start, SCAN_EXTRA[taal].volgendeKnop);
      expect(k?.knop, taal).toContain(FREELANCER_DICTS[taal].start.brancheStep);
      expect(`${k?.teller} ${k?.knop}`, taal).not.toMatch(/[{}]/);
    }
  });

  it("het eindscherm gebruikt de kaart, met een meetcode die de werkerstrechter telt", () => {
    const pagina = readFileSync("app/dashboard/verificatie/page.tsx", "utf8");
    expect(pagina).toContain("verderKaart(poortNu, fd.start, SCAN_EXTRA[taal].volgendeKnop)");
    expect(pagina).toContain("data-track={`verificatie-naar-${verder.sleutel}`}");
    expect(isMeetcode("verificatie-naar-branches")).toBe(true);
  });
});
