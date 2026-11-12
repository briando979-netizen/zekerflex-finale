import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AUTH_DICTS } from "@/lib/i18n/auth";

// 13 nov 2026, eigenaar: de chip "als eerste voorgesteld krijgen" en "de NFC-chip vertelt je nog niet alles perfect".
// Zo doen de grote partijen het (Onfido, ReadID, ABN AMRO, DigiD): vooraf noemen, geen "Overslaan" als eerste keuze,
// uitleg in stappen, na 3 mislukte pogingen verder zonder chip.
const scan = readFileSync(path.join(process.cwd(), "components/app/IdScan.tsx"), "utf8").split("\r\n").join("\n");

describe("chip eerst, met uitleg", () => {
  it("de chip wordt vooraf genoemd, alleen in de app die hem leest (in de browser beloven we niets)", () => {
    expect(scan.match(/extra=\{kanChip \? <p [^>]*>\{s\.chipVooraf\}<\/p> : undefined\}/g)?.length).toBe(2);
    // de oude browserregel staat niet bij de routes (de Android-app is nog niet openbaar)
    const intro = scan.slice(scan.indexOf('{stap === "start" && route === "nl"'), scan.indexOf('{stap === "start" && !route'));
    expect(intro).not.toContain("chipWebHint");
  });

  it("geen 'Zonder chip verder' vóór een mislukte poging of 30 s na 'Chip lezen'", () => {
    expect(scan).toContain('{((chip?.status === "fout" && chipFouten < MAX_CHIP_POGINGEN) || (chip?.status === "wacht" && chipLang)) && (');
    expect(scan).toContain("const MAX_CHIP_POGINGEN = 3;");
    // de 30 s lopen vanaf "wacht" (na het tikken op Chip lezen)
    expect(scan).toContain('const chipWacht = chip?.status === "wacht";');
    expect(scan).toContain("setTimeout(() => setChipLang(true), 30_000)");
    // overslaan telt niet als mislukte poging
    expect(scan).toContain('if (chip?.status === "fout" && chip.tekst !== "") setChipFouten((n) => n + 1);');
  });

  it("de uitleg in stappen, met de juiste regel voor ID-kaart of paspoort", () => {
    expect(scan).toContain('[s.chipStap1, soort === "PASSPORT" ? s.chipStap2Paspoort : s.chipStap2Kaart, s.chipStap3, s.chipStap4, s.chipStap5]');
  });

  it("alle teksten in vijf talen, en de NL-regels zoals afgesproken met de poortwachter", () => {
    const sleutels = ["chipVooraf", "chipStap1", "chipStap2Kaart", "chipStap2Paspoort", "chipStap3", "chipStap4", "chipStap5", "chipDrieKeer", "chipUitleg", "chipFout", "chipOverslaan"] as const;
    for (const [taal, d] of Object.entries(AUTH_DICTS)) {
      for (const k of sleutels) expect(d.onb.scan[k].length, `${taal} ${k}`).toBeGreaterThan(5);
      if (taal !== "nl") for (const k of sleutels) expect(d.onb.scan[k], `${taal} ${k}`).not.toBe(AUTH_DICTS.nl.onb.scan[k]);
    }
    const nl = AUTH_DICTS.nl.onb.scan;
    expect(nl.chipOverslaan).toBe("Zonder chip verder");
    expect(nl.chipStap5).not.toMatch(/Android/);
    expect(nl.chipStap1).toMatch(/hoesje/);
    expect(nl.chipStap4).toMatch(/metalen tafel/);
  });
});
