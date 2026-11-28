import { describe, expect, it } from "vitest";
import { BASIS_LOCALES, LOCALES } from "@/lib/i18n/config";
import { LOCATIE_TEKSTEN, locatieTeksten, vulAantal, vulIn } from "@/lib/locatie/teksten";

// De pagina's van Op locatie draaien op de server en geven deze teksten door aan
// een clientcomponent. Zat er een functie in, dan weigert Next dat met
// "Functions cannot be passed directly to Client Components" en valt de hele
// pagina om (6 nov: /dashboard/voertuig, /dashboard/portofoon). Deze test
// bewaakt dat het gewone tekst blijft.

function functiesIn(waarde: unknown, pad = ""): string[] {
  if (typeof waarde === "function") return [pad || "(wortel)"];
  if (!waarde || typeof waarde !== "object") return [];
  return Object.entries(waarde as Record<string, unknown>).flatMap(([k, v]) =>
    functiesIn(v, pad ? `${pad}.${k}` : k),
  );
}

describe("teksten van Op locatie", () => {
  it("bevat in geen enkele taal een functie", () => {
    for (const [taal, teksten] of Object.entries(LOCATIE_TEKSTEN)) {
      expect(functiesIn(teksten), `taal ${taal}`).toEqual([]);
    }
  });

  it("heeft alle vijf talen en valt terug op Nederlands", () => {
    // de vijf handgemaakte talen, en elke machinetaal een ingang (met het Engels, metMachineTalen)
    for (const l of BASIS_LOCALES) expect(Object.hasOwn(LOCATIE_TEKSTEN, l), l).toBe(true);
    expect(Object.keys(LOCATIE_TEKSTEN).sort()).toEqual([...LOCALES].sort());
    expect(locatieTeksten("nl").portofoon.titel).toBe("Portofoon");
  });

  it("vult een plaatshouder in en laat een onbekende staan", () => {
    expect(vulIn("{naam} praat", { naam: "Sam" })).toBe("Sam praat");
    expect(vulIn("zichtbaar tot {tijd}", { tijd: "17:00" })).toBe("zichtbaar tot 17:00");
    expect(vulIn("hallo {onbekend}", {})).toBe("hallo {onbekend}");
  });

  it("kiest enkelvoud of meervoud", () => {
    const t = locatieTeksten("nl").portofoon;
    expect(vulAantal(t.aanwezig, 1)).toBe("1 persoon luistert");
    expect(vulAantal(t.aanwezig, 3)).toBe("3 personen luisteren");
    expect(vulAantal(t.verbonden, 0)).toContain("0");
  });

  it("elke taal heeft dezelfde plaatshouders als het Nederlands", () => {
    const nl = LOCATIE_TEKSTEN.nl;
    for (const [taal, t] of Object.entries(LOCATIE_TEKSTEN)) {
      expect(t.portofoon.spreekt, `taal ${taal}`).toContain("{naam}");
      expect(t.portofoon.aanwezig.meer, `taal ${taal}`).toContain("{n}");
      expect(t.portofoon.verbonden.meer, `taal ${taal}`).toContain("{n}");
      expect(t.kluis.tot, `taal ${taal}`).toContain("{tijd}");
      expect(Object.keys(t).sort(), `taal ${taal}`).toEqual(Object.keys(nl).sort());
    }
  });
});
