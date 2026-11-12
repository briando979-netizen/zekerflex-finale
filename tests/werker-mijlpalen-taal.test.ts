import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/fiscal/store", () => ({ getFiscal: vi.fn(), invoiceModeFor: vi.fn() }));
vi.mock("@/lib/payroll/uitzend-status", () => ({ getUitzendStatus: vi.fn() }));

import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";
import { MILESTONE_NL } from "@/lib/worker/milestone-teksten";
import { spreadMilestone, type ClientWork } from "@/lib/worker/milestones";

// De mijlpalen op /dashboard/administratie komen in de taal van de werker (lib/worker/milestones.ts krijgt de teksten
// mee); zonder teksten blijft het Nederlands, zoals de dagelijkse push en de bestaande tests verwachten.

const werk = (naam: string, uren: number, tarief = 2000): ClientWork => ({ tenantId: naam, name: naam, minutes: uren * 60, grossCents: uren * tarief });
const TALEN = ["nl", "en", "pl", "ro", "uk"] as const;

describe("mijlpalen in de taal van de werker", () => {
  it("zonder teksten is het Nederlands, en de woordenlijst-NL is dezelfde bron", () => {
    expect(FREELANCER_DICTS.nl.milestones).toBe(MILESTONE_NL);
    expect(spreadMilestone([werk("A", 40), werk("B", 35), werk("C", 25)], 0.7).detail).toContain("3 opdrachtgevers");
  });

  for (const taal of TALEN) {
    it(`${taal}: geen plaatshouder blijft staan en de getallen staan erin`, () => {
      const t = FREELANCER_DICTS[taal].milestones;
      const goed = spreadMilestone([werk("Acme", 40), werk("Beta", 35), werk("Gamma", 25)], 0.7, t);
      expect(goed.headline).toContain("40");
      expect(goed.headline).toContain("Acme");
      expect(goed.detail).toContain("3");
      expect(goed.progress?.label).toContain("70");
      const actie = spreadMilestone([werk("Acme", 90, 3000), werk("Beta", 10)], 0.7, t);
      expect(actie.status).toBe("action");
      expect(actie.detail).toContain("Acme");
      const weinig = spreadMilestone([werk("Acme", 10)], 0.7, t);
      expect(weinig.detail).toContain("60");
      for (const m of [goed, actie, weinig]) {
        for (const veld of [m.title, m.headline, m.detail, m.impact ?? "", m.progress?.label ?? ""]) expect(veld, `${taal}: ${veld}`).not.toMatch(/\{\w+\}/);
      }
    });
  }

  it("een andere taal geeft echt andere tekst dan het Nederlands", () => {
    const nl = spreadMilestone([werk("Acme", 90, 3000), werk("Beta", 10)], 0.7);
    for (const taal of ["en", "pl", "ro", "uk"] as const) {
      const m = spreadMilestone([werk("Acme", 90, 3000), werk("Beta", 10)], 0.7, FREELANCER_DICTS[taal].milestones);
      expect(m.title, taal).not.toBe(nl.title);
      expect(m.detail, taal).not.toBe(nl.detail);
    }
  });

  it("enkelvoud en meervoud kiezen een andere zin waar de taal dat nodig heeft", () => {
    const een = spreadMilestone([werk("Acme", 70)], 0.7, FREELANCER_DICTS.en.milestones);
    // één opdrachtgever met 100% zit boven de grens: de zin gaat over de afhankelijkheid
    expect(een.status).toBe("action");
    const drie = spreadMilestone([werk("A", 40), werk("B", 35), werk("C", 25)], 0.7, FREELANCER_DICTS.en.milestones);
    expect(drie.detail).toContain("3 clients");
  });
});
