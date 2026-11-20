import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";
import { WEEK_VANAF_MAANDAG, weekKolommen } from "@/lib/prefs/weekvolgorde";

// Het scherm "Beschikbaarheid en tarief" van de werker (/dashboard/beschikbaarheid), 20 nov 2026:
// - het weekrooster begon met zondag; in Nederland begint de week op maandag;
// - de vakjes waren 30 px breed en 32 px hoog, te klein voor een duim;
// - "Job-alerts" en "Standby-modus" waren geen gewoon Nederlands.

const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");

describe("weekrooster: maandag eerst, bewaarde dagnummers ongewijzigd", () => {
  const nl = FREELANCER_DICTS.nl.date.wd;

  it("toont ma t/m zo", () => {
    expect(weekKolommen(nl).map((k) => k.naam)).toEqual(["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"]);
  });

  it("elke kolom houdt het dagnummer waaronder de beschikbaarheid bewaard is (zo=0 … za=6)", () => {
    expect([...WEEK_VANAF_MAANDAG]).toEqual([1, 2, 3, 4, 5, 6, 0]);
    // alle zeven dagen, elk precies één keer
    expect([...WEEK_VANAF_MAANDAG].sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
    // de naam van een kolom is altijd de naam die bij zijn dagnummer hoort: niets verschuift
    for (const k of weekKolommen(nl)) expect(k.naam.toLowerCase()).toBe(nl[k.dag]);
    // en dat nummer is het weekdagnummer van JavaScript: 1 nov 2026 is een zondag
    expect(new Date(Date.UTC(2026, 10, 1)).getUTCDay()).toBe(0);
    expect(weekKolommen(nl).find((k) => k.dag === 0)?.naam).toBe("Zo");
    expect(weekKolommen(nl).find((k) => k.dag === 1)?.naam).toBe("Ma");
  });

  it("bestaande beschikbaarheid blijft op dezelfde dag staan", () => {
    // bewaard: maandagochtend (1) en zondagavond (0)
    const bewaard: Partial<Record<number, string[]>> = { 1: ["morning"], 0: ["evening"] };
    const rij = (deel: string) => weekKolommen(nl).map((k) => ((bewaard[k.dag] ?? []).includes(deel) ? k.naam : "-"));
    expect(rij("morning")).toEqual(["Ma", "-", "-", "-", "-", "-", "-"]);
    expect(rij("evening")).toEqual(["-", "-", "-", "-", "-", "-", "Zo"]);
  });

  it("werkt in alle vijf talen en valt niet om op een te korte lijst", () => {
    for (const d of Object.values(FREELANCER_DICTS)) {
      const kolommen = weekKolommen(d.date.wd);
      expect(kolommen).toHaveLength(7);
      for (const k of kolommen) expect(k.naam.length).toBeGreaterThan(0);
    }
    expect(weekKolommen([]).map((k) => k.naam)).toEqual(["", "", "", "", "", "", ""]);
  });

  it("het scherm gebruikt het hulpje en schakelt op het dagnummer, niet op de plek in de rij", () => {
    const bron = lees("components/app/AvailabilityForm.tsx");
    expect(bron).toContain("weekKolommen(ft.date.wd)");
    expect(bron).toContain("toggle(d.dag, p.k)");
    expect(bron).toContain("avail[d.dag]");
    expect(bron).not.toMatch(/DAYS\.map\(\(_, day\)/);
  });
});

describe("vakjes: raakvlak van minstens 40 bij 40 dat op een telefoon past", () => {
  const bron = lees("components/app/AvailabilityForm.tsx");

  it("de knop vult de hele cel en is 44 px hoog", () => {
    expect(bron).toContain('className="block h-11 w-full p-0.5"');
    expect(bron).toContain('<td key={d.dag} className="p-0">');
    expect(bron).not.toContain("h-8 w-full");
  });

  it("de optelsom past op 390 px: zeven kolommen, geen kolom ernaast", () => {
    // 390 − 2×16 (px-4 van het scherm) − 2×24 (p-6 van de kaart) − 2 (rand van de kaart)
    const binnen = 390 - 2 * 16 - 2 * 24 - 2;
    expect(binnen / 7).toBeGreaterThanOrEqual(40);
    // het dagdeel staat boven zijn rij (colSpan 7), niet meer in een eigen kolom die breedte kost
    expect(bron).toContain("colSpan={7}");
    expect(bron).not.toContain("w-[4.5rem]");
    // de kleinste breedte van de tabel (17,5rem = 280 px = 7 × 40) is smaller dan wat er is
    expect(bron).toContain("min-w-[17.5rem]");
    expect(17.5 * 16).toBeLessThanOrEqual(binnen);
    expect((17.5 * 16) / 7).toBeGreaterThanOrEqual(40);
    expect(lees("components/app/FreelancerShell.tsx")).toContain("px-4 pb-28 pt-6");
  });
});

describe("gewone woorden in plaats van Job-alerts en Standby-modus", () => {
  it("Nederlands zonder Engels", () => {
    const nl = FREELANCER_DICTS.nl;
    const teksten = [nl.avail.standby, nl.avail.alertsTitle, nl.avail.alertAdded, nl.avail.alertRemoved, nl.market.emptyBody, nl.page.noJobsBefore];
    for (const t of teksten) expect(t).not.toMatch(/alert|standby|stand-by/i);
    expect(nl.avail.alertsTitle).toBe("Meldingen bij nieuwe klussen");
    expect(nl.avail.standby.startsWith("Oproepbaar")).toBe(true);
  });

  it("alle vijf talen hebben de teksten", () => {
    for (const d of Object.values(FREELANCER_DICTS)) {
      expect(d.avail.standby.length).toBeGreaterThan(10);
      expect(d.avail.alertsTitle.length).toBeGreaterThan(3);
    }
  });
});
