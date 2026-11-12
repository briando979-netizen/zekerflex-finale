import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SCAN_EXTRA } from "@/lib/i18n/scan-extra";
import { AUTH_DICTS } from "@/lib/i18n/auth";
import { WIE_TEKSTEN } from "@/lib/i18n/wie-ben-jij";

// 13 nov 2026, eigenaar: "of je kiest handmatig, of je laat het automatisch doen" (geen knop in de automatische stand)
// en "die handmatige upload moet je helemaal weghalen". Bewaakt de bron, de teksten in vijf talen.
const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");
const scan = lees("components/app/IdScan.tsx");
const kaarten = lees("components/app/WieBenJijIdKaarten.tsx");
const form = lees("components/app/OnboardingForm.tsx");

describe("ID-scan: automatisch of zelf, zonder bestandskeuze", () => {
  it("de twee keuzes starten dezelfde scan, elk met een eigen stand", () => {
    for (const r of ["nl", "eu"]) {
      expect(kaarten).toContain(`onStart("${r}", "auto")`);
      expect(kaarten).toContain(`onStart("${r}", "zelf")`);
    }
    expect(form).toContain("onStart={(r, wz) => void startScan(r, wz)}");
    expect(form).toContain("wijze={wijze}");
  });

  it("in de automatische stand geen knop; in de stand zelf nooit vanzelf een foto", () => {
    expect(scan).toContain("{stand !== \"geen\" && zelf && (");
    expect(scan).toContain("const vanzelfAan = !zelf && kanVanzelfHier;");
    // de drie plekken waar de camera vanzelf afdrukt (selfie, gedraaide selfie, document)
    expect(scan).toContain("if (teller >= SELFIE_LIVE.goedeBeelden && !zelfRef.current) {");
    expect(scan).toContain('if (d.aanwijzing === "goed" && !zelfRef.current) {');
    expect(scan).toContain('if (a === "goed" && groot && !zelfRef.current) {');
  });

  it("omschakelen is een wissel: na ±20 s, of meteen als het hier niet vanzelf kan", () => {
    expect(scan).toContain("setTimeout(() => setTraag(true), 20_000)");
    expect(scan).toContain("onZelf={() => setWijzeNu(\"zelf\")}");
  });

  it("geen bestandskeuze en geen camera-app meer; zonder camera verder op de telefoon", () => {
    expect(scan).not.toContain('type="file"');
    expect(form).not.toContain('type="file"');
    expect(scan).not.toContain("cameraApp");
    expect(scan).not.toContain("toestemmingZonder");
    expect(scan).toContain("onTelefoon={kanTelefoon ? naarTelefoon : undefined}");
    expect(scan).toContain("onClick={() => setStap(terugNa)}");
  });

  it("de teksten staan in alle vijf de talen en beloven geen knop in de automatische stand", () => {
    const talen = Object.keys(SCAN_EXTRA);
    expect(talen.length).toBe(5);
    for (const [taal, x] of Object.entries(SCAN_EXTRA)) {
      for (const k of ["zelfWissel", "zelfWisselKnop", "autoKanNiet", "zelfModus"] as const) expect(x[k].length, `${taal} ${k}`).toBeGreaterThan(5);
    }
    expect(SCAN_EXTRA.nl.vanzelf).not.toMatch(/knop/);
    for (const [taal, d] of Object.entries(AUTH_DICTS)) expect(d.onb.scan.geenCamera, taal).not.toMatch(/camera-app|camera app|aplikacj|aplicați|застосунк/i);
    for (const [taal, w] of Object.entries(WIE_TEKSTEN)) {
      expect(w.id.zelfUitleg.length, taal).toBeGreaterThan(20);
      expect(w.id.zelfUitleg, taal).not.toMatch(/medewerker|staff member|pracownik|angajat|працівник/);
    }
  });
});
