import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { heeftAchterkant } from "@/lib/kyc/document-zijden";
import { AUTH_DICTS } from "@/lib/i18n/auth";

// Een paspoort heeft geen achterkant nodig (12 nov 2026): niet in de ID-scan (ook niet op de telefoon via de QR-code)
// en niet bij "Zelf foto's uploaden".

const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");

describe("welke kanten van een document", () => {
  it("een paspoort zonder achterkant, een ID-kaart en een rijbewijs met", () => {
    expect(heeftAchterkant("PASSPORT")).toBe(false);
    expect(heeftAchterkant("ID_CARD")).toBe(true);
    expect(heeftAchterkant("DRIVERS_LICENSE")).toBe(true);
  });

  it("de ID-scan slaat de achterkant bij een paspoort altijd over, niet alleen in een route", () => {
    const scan = lees("components/app/IdScan.tsx");
    expect(scan).toContain("const zonderAchter = !heeftAchterkant(soort);");
    expect(scan).not.toMatch(/route && st === "(selfie|gegevens)" && zonderAchter/);
  });

  it("geen bestandskeuze meer (13 nov): een paspoort gaat zonder achterkant door de live scan", () => {
    const form = lees("components/app/OnboardingForm.tsx");
    const scan = lees("components/app/IdScan.tsx");
    expect(form).not.toContain('type="file"');
    expect(scan).not.toContain('type="file"');
    expect(scan).toContain("const zonderAchter = !heeftAchterkant(soort);");
  });

  it("de uitleg bij een paspoort staat in alle vijf de talen en noemt geen achterkant als eis", () => {
    for (const [taal, d] of Object.entries(AUTH_DICTS)) {
      expect(d.onb.photosInfoPaspoort.length, taal).toBeGreaterThan(40);
      expect(d.onb.photosInfoPaspoort, taal).not.toBe(d.onb.photosInfo);
    }
    expect(AUTH_DICTS.nl.onb.photosInfoPaspoort).toMatch(/geen achterkant nodig/);
  });
});
