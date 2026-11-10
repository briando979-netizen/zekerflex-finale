import { describe, expect, it } from "vitest";
import { eersteIndrukStand, startStap } from "@/lib/onboarding/eerste-indruk";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";
import { LOCALES } from "@/lib/i18n/config";

const feiten = (over: Partial<Parameters<typeof eersteIndrukStand>[0]> = {}) => ({ heeftFoto: false, aantalErvaringen: 0, geenErvaring: false, heeftMeldingen: false, ...over });

describe("eersteIndrukStand", () => {
  it("telt de werkelijk open stappen en zet de volgende grijs tot de vorige klaar is", () => {
    const leeg = eersteIndrukStand(feiten());
    expect(leeg.open).toBe(3);
    expect(leeg.stappen.map((s) => s.status)).toEqual(["actief", "wacht", "wacht"]);
    const foto = eersteIndrukStand(feiten({ heeftFoto: true }));
    expect(foto.open).toBe(2);
    expect(foto.stappen.map((s) => s.status)).toEqual(["klaar", "actief", "wacht"]);
  });
  it("telt 'geen werkervaring' en een ervaring als klaar", () => {
    expect(eersteIndrukStand(feiten({ heeftFoto: true, geenErvaring: true, heeftMeldingen: true })).alleKlaar).toBe(true);
    expect(eersteIndrukStand(feiten({ heeftFoto: true, aantalErvaringen: 2, heeftMeldingen: true })).alleKlaar).toBe(true);
    expect(eersteIndrukStand(feiten({ aantalErvaringen: 1, heeftMeldingen: true })).open).toBe(1);
  });
  it("meldingen is de derde stap; aan (of niet aan te zetten) telt als klaar", () => {
    const alleenMeldingen = eersteIndrukStand(feiten({ heeftFoto: true, geenErvaring: true }));
    expect(alleenMeldingen.open).toBe(1);
    expect(alleenMeldingen.stappen.map((s) => [s.id, s.status])).toEqual([["foto", "klaar"], ["ervaring", "klaar"], ["meldingen", "actief"]]);
    expect(eersteIndrukStand(feiten({ heeftFoto: true, geenErvaring: true, heeftMeldingen: true })).alleKlaar).toBe(true);
  });
});

describe("startStap", () => {
  it("begint bij de gevraagde stap, anders bij de eerste open stap, anders bij de foto", () => {
    const meldingenOpen = eersteIndrukStand(feiten({ heeftFoto: true, geenErvaring: true }));
    expect(startStap(meldingenOpen)).toBe("meldingen");
    expect(startStap(meldingenOpen, "ervaring")).toBe("ervaring");
    expect(startStap(meldingenOpen, "onzin")).toBe("meldingen");
    expect(startStap(eersteIndrukStand(feiten({ heeftFoto: true }))) ).toBe("ervaring");
    expect(startStap(eersteIndrukStand(feiten({ heeftFoto: true, geenErvaring: true, heeftMeldingen: true })))).toBe("foto");
  });
});

describe("teksten eersteIndruk", () => {
  it("staan in alle vijf talen, met 12 maanden, en bevatten geen cijfers over kansen", () => {
    for (const l of LOCALES) {
      const t = FREELANCER_DICTS[l].eersteIndruk;
      expect(t.months, l).toHaveLength(12);
      expect(t.foto.body.length, l).toBeGreaterThan(20);
      const alles = JSON.stringify(t) + t.card.body(1) + t.card.body(2);
      expect(alles, l).not.toMatch(/\d+\s?%/);
    }
  });
  it("de stap meldingen heeft in elke taal alle teksten, en drie stappen in de voortgang", () => {
    for (const l of LOCALES) {
      const t = FREELANCER_DICTS[l].eersteIndruk;
      for (const [k, v] of Object.entries(t.meldingen)) expect(String(v).trim().length, `${l}: ${k}`).toBeGreaterThan(1);
      expect(t.stap(3), l).toMatch(/3\D+3/);
    }
  });
});
