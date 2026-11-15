import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { RONDLEIDING_BEDRIJF_KEY, RONDLEIDING_BEDRIJF_STAPPEN, RONDLEIDING_BEDRIJF_TEKSTEN, rondleidingBedrijf } from "@/lib/onboarding/rondleiding-bedrijf";
import { RONDLEIDING_KEY, RONDLEIDING_START, RONDLEIDING_STAPPEN } from "@/lib/onboarding/rondleiding";
import { HULP_TEKSTEN_WERKGEVER } from "@/lib/hulp/werkgever-teksten";
import { HULP_TEKSTEN } from "@/lib/hulp/teksten";
import { nl as woordenNl } from "@/lib/i18n/dictionaries";
import { en as woordenEn } from "@/lib/i18n/dictionary-en";

// De rondleiding door de werkgeversapp (15 nov 2026): dezelfde werking als die voor werkers, met eigen stappen, teksten en bewaarsleutel.

const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");

describe("de rondleiding voor bedrijven", () => {
  it("elke stap heeft in nl en en een titel en uitleg, en de knoppen zijn er", () => {
    for (const [taal, t] of Object.entries(RONDLEIDING_BEDRIJF_TEKSTEN)) {
      for (const s of RONDLEIDING_BEDRIJF_STAPPEN) {
        const [titel, tekst] = t.stappen[s];
        expect(titel, `${taal} ${s}`).toBeTruthy();
        expect(tekst.length, `${taal} ${s}`).toBeGreaterThan(30);
      }
      expect(t.stap, taal).toMatch(/\{n\}.*\{m\}/);
      for (const k of [t.volgende, t.vorige, t.overslaan, t.klaar, t.opnieuw[0], t.opnieuw[1]]) expect(k, taal).toBeTruthy();
    }
    expect(rondleidingBedrijf("en")).toBe(RONDLEIDING_BEDRIJF_TEKSTEN.en);
    expect(rondleidingBedrijf("pl")).toBe(RONDLEIDING_BEDRIJF_TEKSTEN.nl);
  });

  it("noemt de menunamen van de werkgeversapp, in beide talen", () => {
    const nl = RONDLEIDING_BEDRIJF_TEKSTEN.nl.stappen;
    const en = RONDLEIDING_BEDRIJF_TEKSTEN.en.stappen;
    const moet: [string, string][] = [
      [nl.klus.join(" "), woordenNl.start.placeShift],
      [nl.klus.join(" "), woordenNl.nav.klussen],
      [nl.uren.join(" "), woordenNl.nav.urenGoedkeuren],
      [nl.facturen.join(" "), woordenNl.nav.facturen],
      [nl.chat.join(" "), woordenNl.nav.chat],
      [en.klus.join(" "), woordenEn.start.placeShift],
      [en.klus.join(" "), woordenEn.nav.klussen],
      [en.uren.join(" "), woordenEn.nav.urenGoedkeuren],
      [en.facturen.join(" "), woordenEn.nav.facturen],
      [en.chat.join(" "), woordenEn.nav.chat],
    ];
    for (const [tekst, naam] of moet) expect(tekst, `"${naam}"`).toContain(naam);
  });

  it("belooft niets wat niet kan (geen bank, voorschot of tegoed)", () => {
    expect(JSON.stringify(RONDLEIDING_BEDRIJF_TEKSTEN)).not.toMatch(/ZekerFlex Bank|voorschot|tegoed|advance|credit/i);
  });

  it("is apart van die van de werker: eigen sleutel en eigen stappen", () => {
    expect(RONDLEIDING_BEDRIJF_KEY).not.toBe(RONDLEIDING_KEY);
    expect([...RONDLEIDING_BEDRIJF_STAPPEN]).not.toEqual([...RONDLEIDING_STAPPEN]);
    expect(RONDLEIDING_BEDRIJF_STAPPEN[0]).toBe("welkom");
    expect(RONDLEIDING_BEDRIJF_STAPPEN[RONDLEIDING_BEDRIJF_STAPPEN.length - 1]).toBe("hulp");
  });

  it("het hulpcentrum van het bedrijf start hem opnieuw, dat van de werker houdt zijn eigen regel", () => {
    expect(HULP_TEKSTEN_WERKGEVER.nl.rondleiding).toEqual(RONDLEIDING_BEDRIJF_TEKSTEN.nl.opnieuw);
    expect(HULP_TEKSTEN_WERKGEVER.en.rondleiding).toEqual(RONDLEIDING_BEDRIJF_TEKSTEN.en.opnieuw);
    expect(HULP_TEKSTEN.nl.rondleiding).toBeUndefined();
    const c = bron("components/app/HulpCentrum.tsx");
    expect(c).toContain("RONDLEIDING_START");
    expect(c).toMatch(/t\.rondleiding && <RondleidingKnop/);
  });

  it("de werkgeversapp monteert hem, en de werker-app houdt de zijne", () => {
    expect(bron("app/werkgever/layout.tsx")).toMatch(/<BedrijfRondleiding t=\{rondleidingBedrijf\(locale\)\} \/>/);
    expect(bron("components/app/FreelancerShell.tsx")).toContain("<WerkerRondleiding />");
    // één uitvoering voor beide, met de teksten, stappen en sleutel als invoer
    const kern = bron("components/app/Rondleiding.tsx");
    expect(kern).toMatch(/export function Rondleiding\(\{ t, stappen, sleutel \}/);
    expect(kern).not.toMatch(/useFT|RONDLEIDING_KEY|RONDLEIDING_STAPPEN/);
    expect(kern).toContain("RONDLEIDING_START");
    expect(bron("components/app/WerkerRondleiding.tsx")).toMatch(/<Rondleiding t=\{t\} stappen=\{RONDLEIDING_STAPPEN\} sleutel=\{RONDLEIDING_KEY\} \/>/);
    expect(bron("components/app/BedrijfRondleiding.tsx")).toMatch(/sleutel=\{RONDLEIDING_BEDRIJF_KEY\}/);
  });

  it("een clientbestand haalt niet beide talen van de hulp binnen (alleen typen)", () => {
    for (const f of ["components/app/BedrijfRondleiding.tsx", "components/app/Rondleiding.tsx"]) {
      expect(bron(f), f).not.toMatch(/import\s+(?!type\b)[^;]*from ["']@\/lib\/hulp\/(teksten|werkgever-teksten)["']/);
    }
    expect(RONDLEIDING_START).toBe("zf-rondleiding-start");
  });
});
