import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { binnenNederland, maakZoeklocatie } from "@/lib/worker/zoeklocatie-kern";
import { START_SCHERM_SINDS, startSchermTonen } from "@/lib/onboarding/werker-poort";
import { ERASABLE_KV_PREFIXES } from "@/lib/privacy/user-kv";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

// 20 nov 2026: de start van een nieuwe werker als twee volschermstappen, zoals de app van YoungOnes (eigenaar: "precies
// zoals YoungOnes, alleen de chat blijft"): waar wil je klussen doen (plaats of huidige locatie), in welke branches.

const lees = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");

describe("zoeklocatie (puur)", () => {
  it("neemt een plaats in Nederland met een naam, afgerond op vijf decimalen", () => {
    expect(maakZoeklocatie({ lat: 52.3702157, lng: 4.8951679, label: "  Amsterdam " })).toEqual({ lat: 52.37022, lng: 4.89517, label: "Amsterdam" });
    expect(binnenNederland(53.2194, 6.5665)).toBe(true);
  });
  it("weigert wat geen plaats is: buiten Nederland, zonder naam, geen getallen, geen object", () => {
    expect(maakZoeklocatie({ lat: 48.8566, lng: 2.3522, label: "Parijs" })).toBeNull();
    expect(maakZoeklocatie({ lat: 52.37, lng: 4.9, label: "   " })).toBeNull();
    expect(maakZoeklocatie({ lat: "52.37", lng: 4.9, label: "Amsterdam" })).toBeNull();
    expect(maakZoeklocatie({ lat: Number.NaN, lng: 4.9, label: "Amsterdam" })).toBeNull();
    expect(maakZoeklocatie(null)).toBeNull();
    expect(maakZoeklocatie("Amsterdam")).toBeNull();
  });
  it("kapt een te lange naam af", () => {
    expect(maakZoeklocatie({ lat: 52.37, lng: 4.9, label: "x".repeat(300) })?.label.length).toBe(120);
  });
  it("valt onder het wissen van gegevens (AVG)", () => {
    expect(ERASABLE_KV_PREFIXES).toContain("werker-zoeklocatie:");
  });
});

describe("wie het startscherm ziet", () => {
  const nieuw = new Date(START_SCHERM_SINDS + 3_600_000);
  const oud = new Date(START_SCHERM_SINDS - 3_600_000);
  it("alleen een nieuw account dat nog geen branches koos en nog niet klaar is", () => {
    expect(startSchermTonen({ klaar: false, brancheKeuze: null }, nieuw)).toBe(true);
    expect(startSchermTonen({ klaar: false, brancheKeuze: { alle: true, branches: [] } }, nieuw)).toBe(false);
    expect(startSchermTonen({ klaar: true, brancheKeuze: null }, nieuw)).toBe(false);
    expect(startSchermTonen({ klaar: false, brancheKeuze: null }, oud)).toBe(false);
    expect(startSchermTonen({ klaar: false, brancheKeuze: null }, null)).toBe(false);
  });
  it("Ontdekken stuurt zo'n account door, de shell toont er geen balken, en de pagina bestaat", () => {
    expect(lees("app/dashboard/klussen/page.tsx")).toContain('if (poort && startSchermTonen(poort, poort.aangemeldOp)) redirect("/dashboard/start");');
    expect(lees("components/app/FreelancerShell.tsx")).toContain('pathname === "/dashboard/start"');
    const pagina = lees("app/dashboard/start/page.tsx");
    expect(pagina).toContain("<StartSchermen");
    expect(pagina).toContain('redirect("/dashboard/klussen")');
  });
  it("het scherm vraagt nooit vanzelf om de locatie en bewaart via de eigen routes", () => {
    const s = lees("components/app/StartSchermen.tsx");
    expect(s).toContain("navigator.geolocation.getCurrentPosition");
    expect(s).not.toMatch(/useEffect\([^)]*getCurrentPosition/);
    expect(s).toContain('fetch("/api/me/zoeklocatie"');
    expect(s).toContain('fetch("/api/me/branches"');
    expect(s).toContain('role="progressbar"');
    expect(s.match(/role="alert"/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    // alleen een client-veilig, puur bestand voor de vorm van de plaats
    expect(s).toContain('from "@/lib/worker/zoeklocatie-kern"');
    expect(s).not.toContain('from "@/lib/worker/zoeklocatie"');
  });
  it("de teksten in vijf talen", () => {
    for (const [taal, d] of Object.entries(FREELANCER_DICTS)) {
      for (const k of ["locatieUitleg", "locatieVerder", "brancheTitel", "brancheProfielAan", "terugKnop"] as const) {
        expect(d.start[k].length, `${taal} ${k}`).toBeGreaterThan(2);
        if (taal !== "nl" && k !== "terugKnop") expect(d.start[k], `${taal} ${k}`).not.toBe(FREELANCER_DICTS.nl.start[k]);
      }
      expect(d.start.locatieVerder).toContain("{plaats}");
    }
  });
});
