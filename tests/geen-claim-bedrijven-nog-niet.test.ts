import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { nl } from "@/lib/i18n/dictionaries";
import { en } from "@/lib/i18n/dictionary-en";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";
import { KVK_ZOEKER_TEKSTEN_EN, KVK_ZOEKER_TEKSTEN_NL } from "@/lib/kvk/keuze";
import { installRegel } from "@/lib/app-vereist";

// 23 nov 2026 (eigenaar): er staat nog geen echt bedrijf op ZekerFlex. In de teksten rond het installeren van de app, de klus-wizard
// en het kiezen van een bedrijf staat dus nergens iets als "de eerste bedrijven plaatsen nu klussen" of "bedrijven plaatsen klussen".
// Een algemene uitleg van hoe het werkt ("je plaatst een klus en betaalt per gewerkt uur") mag wel; een bewering over wie het nu al doet niet.

const lees = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");

const CLAIM =
  /eerste bedrijven|bedrijven (plaatsen|zetten|staan|werken|gebruiken|zoeken)\b[^.]{0,40}\b(nu|al|reeds|klussen)\b|plaatsen nu klussen|al (\d+|honderden|duizenden) bedrijven|companies (are )?(already )?(post|place|use|hire)|first companies|employers (are )?(already )?(post|use)/i;

describe("geen claim over bedrijven die er nog niet zijn", () => {
  it("de teksten rond het installeren van de app", () => {
    for (const f of ["components/marketing/AppDownload.tsx", "components/marketing/TesterWordenForm.tsx", "components/app/AppInstallatie.tsx", "components/app/AppVereist.tsx"]) {
      expect(lees(f), f).not.toMatch(CLAIM);
    }
    for (const alleenApp of [true, false]) {
      for (const appStore of [true, false]) expect(installRegel({ appStore, alleenApp })).not.toMatch(CLAIM);
    }
    for (const [taal, d] of Object.entries(FREELANCER_DICTS)) expect(JSON.stringify(d.appVereist), taal).not.toMatch(CLAIM);
  });

  it("het kiezen van een bedrijf bij het aanmelden", () => {
    for (const f of ["components/kvk/KvkZoeker.tsx", "lib/kvk/keuze.ts"]) expect(lees(f), f).not.toMatch(CLAIM);
    expect(JSON.stringify(KVK_ZOEKER_TEKSTEN_NL)).not.toMatch(CLAIM);
    expect(JSON.stringify(KVK_ZOEKER_TEKSTEN_EN)).not.toMatch(CLAIM);
  });

  it("het voorbeeld in de klus-wizard en de kaart op /klus-plaatsen", () => {
    for (const f of ["components/app/NewShiftForm.tsx", "components/app/KlusBeeldVlak.tsx", "components/marketing/KlusKaart.tsx"]) {
      expect(lees(f), f).not.toMatch(CLAIM);
    }
    expect(JSON.stringify(nl.newShiftForm)).not.toMatch(CLAIM);
    expect(JSON.stringify(en.newShiftForm)).not.toMatch(CLAIM);
  });

  it("de bewaker herkent een claim en laat een uitleg van hoe het werkt met rust", () => {
    expect(CLAIM.test("De eerste bedrijven plaatsen nu klussen")).toBe(true);
    expect(CLAIM.test("Bedrijven plaatsen klussen op ZekerFlex")).toBe(true);
    expect(CLAIM.test("Al 120 bedrijven gebruiken ZekerFlex")).toBe(true);
    expect(CLAIM.test("Companies are already posting jobs")).toBe(true);
    expect(CLAIM.test("Je plaatst een klus en betaalt per gewerkt uur")).toBe(false);
    expect(CLAIM.test("Zoek je bedrijf in het Handelsregister")).toBe(false);
  });
});
