import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FASE_TOON, klusFase, klusTab, urenNogOpen, type KlusVoorFase } from "@/lib/werkgever/klus-fase";

// De status van een klus zoals het bedrijf hem ziet (23 nov 2026, de vijf statussen van YoungOnes plus Concept en Geannuleerd), en
// in welk tabblad van de klussenlijst hij staat. Een voorbije volle klus stond in "Klaar om uit te voeren" én in "Gearchiveerd".

const NU = new Date("2026-11-23T12:00:00+01:00").getTime();
const uur = 3_600_000;
const klus = (p: Partial<KlusVoorFase> & { vanaf?: number; tot?: number } = {}): KlusVoorFase => ({
  status: "OPEN",
  startsAt: new Date(NU + (p.vanaf ?? 24) * uur),
  endsAt: new Date(NU + (p.tot ?? 32) * uur),
  aangenomen: 0,
  urenOpen: false,
  ...p,
});

describe("klusFase", () => {
  it("volgt de klus van openstaand tot gearchiveerd", () => {
    expect(klusFase(klus({ status: "OPEN" }), NU)).toBe("openstaand");
    expect(klusFase(klus({ status: "PARTIALLY_FILLED", aangenomen: 1 }), NU)).toBe("openstaand");
    expect(klusFase(klus({ status: "FILLED", aangenomen: 2 }), NU)).toBe("klaar");
    expect(klusFase(klus({ status: "FILLED", aangenomen: 2, vanaf: -2, tot: 6 }), NU)).toBe("bezig");
    expect(klusFase(klus({ status: "FILLED", aangenomen: 2, vanaf: -30, tot: -22, urenOpen: true }), NU)).toBe("uren");
    expect(klusFase(klus({ status: "FILLED", aangenomen: 2, vanaf: -30, tot: -22, urenOpen: false }), NU)).toBe("archief");
    expect(klusFase(klus({ status: "COMPLETED", vanaf: -30, tot: -22 }), NU)).toBe("archief");
  });

  it("een klus die begon zonder iemand blijft openstaand tot hij voorbij is, en is daarna archief (geen uren om te controleren)", () => {
    expect(klusFase(klus({ status: "OPEN", vanaf: -1, tot: 7 }), NU)).toBe("openstaand");
    expect(klusFase(klus({ status: "OPEN", vanaf: -30, tot: -22, urenOpen: true }), NU)).toBe("archief");
  });

  it("concept en geannuleerd gaan voor de tijd", () => {
    expect(klusFase(klus({ status: "DRAFT", vanaf: -30, tot: -22 }), NU)).toBe("concept");
    expect(klusFase(klus({ status: "CANCELLED", aangenomen: 2 }), NU)).toBe("geannuleerd");
  });

  it("de kleuren houden hun betekenis: amber wacht op jou, blauw gepland, groen loopt, goud geld, rood gaat niet door", () => {
    expect(FASE_TOON).toMatchObject({ openstaand: "warn", klaar: "plan", bezig: "ok", uren: "money", archief: "neutral", geannuleerd: "crit", concept: "neutral" });
  });

  it("uren zijn open tot ze zijn goedgekeurd of betaald", () => {
    expect(urenNogOpen(null)).toBe(true);
    expect(urenNogOpen("DRAFT")).toBe(true);
    expect(urenNogOpen("SUBMITTED")).toBe(true);
    expect(urenNogOpen("APPROVED")).toBe(false);
    expect(urenNogOpen("PAID")).toBe(false);
  });
});

describe("klusTab: elke klus staat in precies één tabblad", () => {
  const TABS = ["open", "gepland", "historie"] as const;
  const STATUSSEN = ["DRAFT", "OPEN", "MATCHING", "PARTIALLY_FILLED", "FILLED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];

  it("een voorbije volle klus staat alleen bij gearchiveerd, niet ook bij klaar om uit te voeren", () => {
    expect(klusTab({ status: "FILLED", endsAt: new Date(NU - 22 * uur) }, NU)).toBe("historie");
    expect(klusTab({ status: "FILLED", endsAt: new Date(NU + 32 * uur) }, NU)).toBe("gepland");
    // een volle klus die nu bezig is hoort nog niet in het archief
    expect(klusTab({ status: "FILLED", endsAt: new Date(NU + 2 * uur) }, NU)).toBe("gepland");
  });

  it("wie nog krachten zoekt staat bij openstaand; afgerond en geannuleerd bij gearchiveerd", () => {
    for (const status of ["OPEN", "MATCHING", "PARTIALLY_FILLED"]) expect(klusTab({ status, endsAt: new Date(NU + 32 * uur) }, NU)).toBe("open");
    expect(klusTab({ status: "OPEN", endsAt: new Date(NU - uur) }, NU)).toBe("historie");
    expect(klusTab({ status: "CANCELLED", endsAt: new Date(NU + 32 * uur) }, NU)).toBe("historie");
    expect(klusTab({ status: "COMPLETED", endsAt: new Date(NU + 32 * uur) }, NU)).toBe("historie");
    expect(klusTab({ status: "DRAFT", endsAt: new Date(NU + 32 * uur) }, NU)).toBe("gepland");
  });

  it("voor elke status en elk moment is er precies één tab", () => {
    for (const status of STATUSSEN) {
      for (const eind of [-48, -1, 1, 48]) {
        const tab = klusTab({ status, endsAt: new Date(NU + eind * uur) }, NU);
        expect(TABS.filter((t) => t === tab)).toHaveLength(1);
      }
    }
  });

  it("de klussenlijst deelt de tabbladen in met klusTab", () => {
    const pagina = readFileSync(path.join(process.cwd(), "app/werkgever/diensten/page.tsx"), "utf8");
    for (const tab of TABS) expect(pagina).toContain(`klusTab(s, now) === "${tab}"`);
    expect(pagina).not.toContain('s.status === "FILLED" ||');
  });
});
