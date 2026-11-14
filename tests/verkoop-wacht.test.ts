import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const live = vi.hoisted(() => ({
  outreach: [] as { createdAt: Date }[],
  leads: [] as { createdAt: Date }[],
  proposals: [] as { status: string; createdAt: string; expiresAt: string }[],
  scans: [] as unknown[],
  storeKapot: false,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    salesOutreach: { findMany: async () => live.outreach },
    salesLead: { findMany: async () => live.leads },
  },
}));
vi.mock("@/lib/sales/website-proposal", () => ({ listWebsiteProposals: async () => live.proposals }));
vi.mock("@/lib/scans/store", () => ({
  lijstScans: async () => {
    if (live.storeKapot) throw new Error("kv weg");
    return live.scans;
  },
}));

import { verkoopItems, verkoopWacht, wachtendeConcepten, wachtendeScans, warmeLeadsZonderConcept } from "@/lib/admin/verkoop-wacht";

const DAG = 86_400_000;
const NU = Date.parse("2026-11-14T04:00:00Z");
const geleden = (dagen: number) => new Date(NU - dagen * DAG);
const scan = (dagen: number, stappen: string[]) => ({
  sleutel: `website:s${dagen}`,
  soort: "website",
  scanId: `s${dagen}`,
  at: geleden(dagen).toISOString(),
  // geen .test/.example: die hosts telt scanOverzicht als eigen tests en laat hij weg
  host: `bedrijf${dagen}.fixture`,
  naam: `Bedrijf ${dagen}`,
  plaats: null,
  score: 60,
  samenvatting: "",
  rapport: "/x",
  leadId: null,
  dealId: null,
  siteSlug: null,
  stappen: [{ stap: "gescand", at: geleden(dagen).toISOString() }, ...stappen.map((stap) => ({ stap, at: geleden(Math.max(0, dagen - 1)).toISOString() }))],
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NU));
  live.outreach = [];
  live.leads = [];
  live.proposals = [];
  live.scans = [];
  live.storeKapot = false;
});
afterEach(() => vi.useRealTimers());

describe("verkoop-wacht: de tellingen", () => {
  it("telt concept-mails vanaf 3 dagen, met het oudste aantal dagen", async () => {
    live.outreach = [{ createdAt: geleden(14) }, { createdAt: geleden(14) }, { createdAt: geleden(5) }, { createdAt: geleden(1) }];
    expect(await wachtendeConcepten()).toEqual({ aantal: 3, oudsteDagen: 14 });
    live.outreach = [];
    expect(await wachtendeConcepten()).toEqual({ aantal: 0, oudsteDagen: 0 });
  });

  it("telt scans die op opvolging wachten, apart wie om contact vroeg, en de tijd sinds de scan", async () => {
    live.scans = [scan(6, ["aanvraag"]), scan(3, ["nieuwe-site"]), scan(2, [])];
    const s = await wachtendeScans();
    expect(s).toMatchObject({ wachten: 2, aanvragen: 1, aantal: 2, oudsteDagen: 6 });
    live.storeKapot = true;
    expect(await wachtendeScans()).toBeUndefined();
  });

  it("warme leads zonder concept", async () => {
    live.leads = [{ createdAt: geleden(2) }, { createdAt: geleden(0) }];
    expect(await warmeLeadsZonderConcept()).toEqual({ aantal: 2, oudsteDagen: 2 });
  });
});

describe("verkoop-wacht: de kaart", () => {
  it("zet alleen soorten met werk op de kaart, de oudste eerst, met een link naar de juiste tab", () => {
    const k = verkoopItems({
      concepten: { aantal: 3, oudsteDagen: 14 },
      scans: { wachten: 6, aanvragen: 2, aantal: 6, oudsteDagen: 9 },
      voorstellen: { aantal: 5, oudsteDagen: 20 },
      warm: { aantal: 0, oudsteDagen: 0 },
    });
    expect(k.totaal).toBe(14);
    expect(k.items.map((i) => i.id)).toEqual(["voorstellen", "concepten", "scans"]);
    expect(k.items[0]).toMatchObject({ label: "5 websitevoorstellen", href: "/admin/websitevoorstellen", oudsteDagen: 20 });
    expect(k.items[1]).toMatchObject({ label: "3 concept-mails", href: "/admin/sales?weergave=leads&filter=wacht" });
    expect(k.items[2]?.label).toBe("6 gratis scans (2 vroegen om contact)");
    expect(k.onbekend).toEqual([]);
    // geen namen of adressen, alleen aantallen
    for (const i of k.items) expect(`${i.label} ${i.doen}`).not.toMatch(/@/);
  });

  it("enkelvoud en de onleesbare soorten", () => {
    const k = verkoopItems({ concepten: { aantal: 1, oudsteDagen: 3 }, scans: undefined, voorstellen: null, warm: { aantal: 1, oudsteDagen: 0 } });
    expect(k.items.map((i) => i.label)).toEqual(["1 concept-mail", "1 warme lead zonder concept"]);
    expect(k.onbekend).toEqual(["scans", "voorstellen"]);
  });

  it("bij nul overal: geen items en totaal 0", async () => {
    expect((await verkoopWacht()).totaal).toBe(0);
    expect((await verkoopWacht()).items).toEqual([]);
  });

  it("verkoopWacht voegt alles samen", async () => {
    live.outreach = [{ createdAt: geleden(14) }];
    live.proposals = [{ status: "concept", createdAt: geleden(3).toISOString(), expiresAt: geleden(-10).toISOString() }, { status: "verstuurd", createdAt: geleden(9).toISOString(), expiresAt: geleden(-10).toISOString() }];
    const k = await verkoopWacht();
    expect(k.totaal).toBe(2);
    expect(k.items.map((i) => [i.id, i.oudsteDagen])).toEqual([["concepten", 14], ["voorstellen", 3]]);
  });
});
