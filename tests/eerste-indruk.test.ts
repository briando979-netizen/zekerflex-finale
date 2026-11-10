import { describe, expect, it } from "vitest";
import { eersteIndrukStand } from "@/lib/onboarding/eerste-indruk";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";
import { LOCALES } from "@/lib/i18n/config";

describe("eersteIndrukStand", () => {
  it("telt de werkelijk open stappen en zet de volgende grijs tot de vorige klaar is", () => {
    const leeg = eersteIndrukStand({ heeftFoto: false, aantalErvaringen: 0, geenErvaring: false });
    expect(leeg.open).toBe(2);
    expect(leeg.stappen.map((s) => s.status)).toEqual(["actief", "wacht"]);
    const foto = eersteIndrukStand({ heeftFoto: true, aantalErvaringen: 0, geenErvaring: false });
    expect(foto.open).toBe(1);
    expect(foto.stappen.map((s) => s.status)).toEqual(["klaar", "actief"]);
  });
  it("telt 'geen werkervaring' en een ervaring als klaar", () => {
    expect(eersteIndrukStand({ heeftFoto: true, aantalErvaringen: 0, geenErvaring: true }).alleKlaar).toBe(true);
    expect(eersteIndrukStand({ heeftFoto: true, aantalErvaringen: 2, geenErvaring: false }).alleKlaar).toBe(true);
    expect(eersteIndrukStand({ heeftFoto: false, aantalErvaringen: 1, geenErvaring: false }).open).toBe(1);
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
});
