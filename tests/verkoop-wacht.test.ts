import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Verkoop: wat wacht er op een mens (lib/admin/verkoop-wacht.ts). Sinds 22 nov 2026 (fase C) alleen concept-mails en
// warme leads; de gratis scans en de websitevoorstellen zijn weggehaald.

const live = vi.hoisted(() => ({
  outreach: [] as { createdAt: Date }[],
  leads: [] as { createdAt: Date }[],
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    salesOutreach: { findMany: async () => live.outreach },
    salesLead: { findMany: async () => live.leads },
  },
}));

import { verkoopItems, verkoopWacht, wachtendeConcepten, warmeLeadsZonderConcept } from "@/lib/admin/verkoop-wacht";

const DAG = 86_400_000;
const NU = Date.parse("2026-11-14T04:00:00Z");
const geleden = (dagen: number) => new Date(NU - dagen * DAG);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NU));
  live.outreach = [];
  live.leads = [];
});
afterEach(() => vi.useRealTimers());

describe("verkoop-wacht: de tellingen", () => {
  it("telt concept-mails vanaf 3 dagen, met het oudste aantal dagen", async () => {
    live.outreach = [{ createdAt: geleden(14) }, { createdAt: geleden(14) }, { createdAt: geleden(5) }, { createdAt: geleden(1) }];
    expect(await wachtendeConcepten()).toEqual({ aantal: 3, oudsteDagen: 14 });
    live.outreach = [];
    expect(await wachtendeConcepten()).toEqual({ aantal: 0, oudsteDagen: 0 });
  });

  it("warme leads zonder concept", async () => {
    live.leads = [{ createdAt: geleden(2) }, { createdAt: geleden(0) }];
    expect(await warmeLeadsZonderConcept()).toEqual({ aantal: 2, oudsteDagen: 2 });
  });
});

describe("verkoop-wacht: de kaart", () => {
  it("zet alleen soorten met werk op de kaart, de oudste eerst, met een link naar de juiste tab", () => {
    const k = verkoopItems({ concepten: { aantal: 3, oudsteDagen: 14 }, warm: { aantal: 2, oudsteDagen: 20 } });
    expect(k.totaal).toBe(5);
    expect(k.items.map((i) => i.id)).toEqual(["warm", "concepten"]);
    expect(k.items[1]).toMatchObject({ label: "3 concept-mails", href: "/admin/sales?weergave=leads&filter=wacht" });
    expect(k.onbekend).toEqual([]);
    // geen namen of adressen, alleen aantallen
    for (const i of k.items) expect(`${i.label} ${i.doen}`).not.toMatch(/@/);
  });

  it("enkelvoud en de onleesbare soorten", () => {
    const k = verkoopItems({ concepten: null, warm: { aantal: 1, oudsteDagen: 0 } });
    expect(k.items.map((i) => i.label)).toEqual(["1 warme lead zonder concept"]);
    expect(k.onbekend).toEqual(["concepten"]);
  });

  it("bij nul overal: geen items en totaal 0", async () => {
    expect((await verkoopWacht()).totaal).toBe(0);
    expect((await verkoopWacht()).items).toEqual([]);
  });

  it("verkoopWacht voegt alles samen", async () => {
    live.outreach = [{ createdAt: geleden(14) }];
    live.leads = [{ createdAt: geleden(3) }];
    const k = await verkoopWacht();
    expect(k.totaal).toBe(2);
    expect(k.items.map((i) => [i.id, i.oudsteDagen])).toEqual([["concepten", 14], ["warm", 3]]);
  });
});
