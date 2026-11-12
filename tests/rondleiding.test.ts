import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";
import { NA_EERSTE_SESSIE_MS, RONDLEIDING_STAPPEN, leesRondleidingStand, rondleidingBeslissing } from "@/lib/onboarding/rondleiding";

// De rondleiding door de werker-app (12 nov 2026, eigenaar): na de eerste sessie één keer, met Volgende en
// Overslaan; daarna via Hulp.

const NU = Date.parse("2026-11-12T15:00:00+01:00");

describe("wanneer de rondleiding verschijnt", () => {
  it("eerste bezoek: niet tonen, alleen het tijdstip bewaren", () => {
    expect(rondleidingBeslissing({}, NU)).toEqual({ toon: false, bewaar: { eerste: NU } });
  });

  it("in dezelfde sessie niet, na een half uur of later één keer", () => {
    expect(rondleidingBeslissing({ eerste: NU - 5 * 60_000 }, NU).toon).toBe(false);
    expect(rondleidingBeslissing({ eerste: NU - NA_EERSTE_SESSIE_MS }, NU)).toEqual({ toon: true, bewaar: null });
    expect(rondleidingBeslissing({ eerste: NU - 3 * 86_400_000 }, NU).toon).toBe(true);
  });

  it("overgeslagen of afgerond: nooit meer vanzelf", () => {
    expect(rondleidingBeslissing({ eerste: NU - 86_400_000, gezien: true }, NU)).toEqual({ toon: false, bewaar: null });
  });

  it("een kapotte of vreemde opgeslagen waarde telt als eerste bezoek", () => {
    for (const ruw of [null, "", "{", "[]", "42", '{"eerste":"gisteren"}', '{"gezien":"ja"}']) {
      expect(leesRondleidingStand(ruw)).toEqual({});
    }
    expect(leesRondleidingStand(JSON.stringify({ eerste: NU, gezien: true }))).toEqual({ eerste: NU, gezien: true });
  });
});

describe("de stappen en teksten", () => {
  it("elke stap heeft in alle vijf talen een titel en uitleg, en de knoppen zijn er", () => {
    for (const [taal, d] of Object.entries(FREELANCER_DICTS)) {
      const r = d.rondleiding;
      for (const s of RONDLEIDING_STAPPEN) {
        const [titel, tekst] = r.stappen[s];
        expect(titel, `${taal} ${s}`).toBeTruthy();
        expect((tekst ?? "").length, `${taal} ${s}`).toBeGreaterThan(30);
      }
      expect(r.stap, taal).toMatch(/\{n\}.*\{m\}/);
      for (const k of [r.volgende, r.vorige, r.overslaan, r.klaar, r.opnieuw[0], r.opnieuw[1]]) expect(k, taal).toBeTruthy();
    }
  });

  it("elke stap met een plek wijst die aan: de tabbalk en het vraagteken dragen data-rondleiding", () => {
    const schil = readFileSync(path.join(process.cwd(), "components/app/FreelancerShell.tsx"), "utf8");
    const hulp = readFileSync(path.join(process.cwd(), "components/app/HulpCentrum.tsx"), "utf8");
    expect(schil).toMatch(/data-rondleiding=\{t\.key\}/);
    expect(hulp).toMatch(/data-rondleiding="hulp"/);
    for (const s of RONDLEIDING_STAPPEN.filter((x) => x !== "welkom" && x !== "hulp")) {
      expect(schil, s).toMatch(new RegExp(`key: "${s}"`));
    }
    // Hulp start de rondleiding opnieuw
    expect(hulp).toMatch(/RONDLEIDING_START/);
  });
});
