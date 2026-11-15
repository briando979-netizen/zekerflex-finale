import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/sales/engine", () => ({ enginePaused: async () => false }));

import { oordeel, type AutomatiseringStand } from "@/lib/sales/automatisering";

const basis = (over: Partial<AutomatiseringStand> = {}): AutomatiseringStand => ({
  engineAan: true,
  gepauzeerd: false,
  autopilotToegestaan: true,
  campagnes: [{ naam: "Horeca Groningen", modus: "REVIEW", autopilotBevestigd: false, minScore: 55, dagGrens: 40 }],
  verstuurdVandaag: 0,
  wachtOpJou: 0,
  laatsteRun: null,
  leads: { open: 100, zonderScore: 80, zonderMail: 10, zonderVacature: 5, klaarVoorConcept: 5 },
  ...over,
});

describe("oordeel over de sales-motor", () => {
  it("zegt eerlijk dat versturen niet vanzelf gaat zolang de campagne op handmatig staat", () => {
    const o = oordeel(basis({ wachtOpJou: 3 }));
    expect(o.niveau).toBe("let-op");
    expect(o.kop).toContain("versturen niet");
    expect(o.regels.join(" ")).toContain("3 concepten wachten");
  });

  it("noemt de motor uit of gepauzeerd, of een ontbrekende campagne, als stil", () => {
    expect(oordeel(basis({ engineAan: false })).niveau).toBe("stil");
    expect(oordeel(basis({ gepauzeerd: true })).niveau).toBe("stil");
    expect(oordeel(basis({ campagnes: [] })).niveau).toBe("stil");
  });

  it("een bevestigde automatische campagne met werk te doen is ok", () => {
    const o = oordeel(basis({ campagnes: [{ naam: "A", modus: "AUTOPILOT", autopilotBevestigd: true, minScore: 55, dagGrens: 40 }] }));
    expect(o.niveau).toBe("ok");
  });

  it("automatisch zonder de globale schakelaar verstuurt niets", () => {
    const o = oordeel(basis({ autopilotToegestaan: false, campagnes: [{ naam: "A", modus: "AUTOPILOT", autopilotBevestigd: true, minScore: 55, dagGrens: 40 }] }));
    expect(o.niveau).toBe("let-op");
    expect(o.regels.join(" ")).toContain("SALES_AUTOPILOT_ENABLED");
  });

  it("een campagne die alleen op AUTOPILOT staat maar niet is bevestigd telt als handmatig", () => {
    const o = oordeel(basis({ campagnes: [{ naam: "A", modus: "AUTOPILOT", autopilotBevestigd: false, minScore: 55, dagGrens: 40 }] }));
    expect(o.kop).toContain("versturen niet");
  });
});
