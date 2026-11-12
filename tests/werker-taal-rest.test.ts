import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";

// Het scherm "Werkvorm & fiscale gegevens" en het uitzendpaneel in de werker-app zijn vijftalig; Nederlands blijft woord voor woord wat er stond.

const TALEN = ["nl", "en", "pl", "ro", "uk"] as const;
const SECTIES = ["fiscaalForm", "uitzendPanel"] as const;
const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");
const plaats = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort().join(",");

function platte(o: unknown, voorvoegsel = ""): [string, string][] {
  if (typeof o === "string") return [[voorvoegsel, o]];
  return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => platte(v, voorvoegsel ? `${voorvoegsel}.${k}` : k));
}

describe("fiscaal formulier en uitzendpaneel in vijf talen", () => {
  it("Nederlands is de standaard en gelijk aan wat er stond", () => {
    const nl = FREELANCER_DICTS.nl;
    expect(nl.fiscaalForm.titel).toBe("Werkvorm & fiscale gegevens");
    expect(nl.fiscaalForm.kinds.zzp.label).toBe("ZZP'er");
    expect(nl.fiscaalForm.overstap).toBe("Je stapt over van {van} naar {naar}.");
    expect(nl.uitzendPanel.gewerkt).toBe("{weken} gewerkte weken · {uren} uur totaal");
  });

  it("elke taal heeft alle sleutels, dezelfde plaatshouders en een echte vertaling", () => {
    for (const sectie of SECTIES) {
      const nl = platte(FREELANCER_DICTS.nl[sectie]);
      for (const taal of TALEN) {
        const v = new Map(platte(FREELANCER_DICTS[taal][sectie]));
        expect([...v.keys()].sort(), `${taal} ${sectie}`).toEqual(nl.map(([k]) => k).sort());
        for (const [k, tekst] of nl) {
          const x = v.get(k)!;
          expect(x.length, `${taal} ${sectie}.${k} leeg`).toBeGreaterThan(0);
          expect(plaats(x), `${taal} ${sectie}.${k} plaatshouders`).toBe(plaats(tekst));
          if (taal !== "nl" && /[a-z]{4}/i.test(tekst) && !/^[•\d\s·]+$/.test(tekst) && k !== "bsn" && k !== "btw") {
            expect(x, `${taal} ${sectie}.${k} is niet vertaald`).not.toBe(tekst);
          }
        }
      }
    }
  });

  it("de onderdelen hebben geen vaste Nederlandse zinnen meer", () => {
    const fiscaal = bron("components/app/FiscalForm.tsx");
    const uitzend = bron("components/app/UitzendPanel.tsx");
    const pagina = bron("app/dashboard/fiscaal/page.tsx");
    for (const oud of ["Wat is jouw werkvorm", "Opslaan mislukt", "Samenvatting", "Van gedachten veranderd", "Vul hieronder nog in"]) {
      expect(fiscaal, oud).not.toContain(oud);
    }
    for (const oud of ["gewerkte weken", "StiPP pensioen", "Loonheffingskorting toepassen", "Basisregeling:"]) {
      expect(uitzend, oud).not.toContain(oud);
    }
    expect(pagina).not.toContain("Werkvorm & fiscale gegevens");
    expect(fiscaal).toContain("useFT()");
    expect(uitzend).toContain("useFT()");
    expect(pagina).toContain("getFreelancerDict");
  });
});
