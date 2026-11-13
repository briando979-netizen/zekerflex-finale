import { afterEach, describe, expect, it, vi } from "vitest";

// Financien & winst rekent met het maandtotaal uit Beheer -> Kosten (opgegeven posten, excl. btw, geen schattingen en
// geen onbekende bedragen). Geen lijst, een storing of niets te tellen: de eigen instelling blijft en er staat een
// melding "kosten nog niet ingevuld", nooit een stille 0.

const h = vi.hoisted(() => ({ kvGet: vi.fn(), settings: vi.fn(), groupBy: vi.fn(async (): Promise<unknown[]> => []) }));
vi.mock("@/lib/storage/kv", () => ({ kvGet: h.kvGet, kvSet: vi.fn(async () => undefined) }));
vi.mock("@/lib/env", () => ({ env: { UITZEND_MARKUP_RATE: 0.1 } }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    invoice: { groupBy: h.groupBy },
    shopOrder: { aggregate: async () => ({ _sum: { subtotalCents: null, totalCents: null } }) },
  },
}));
vi.mock("@/lib/admin/revenue-events", () => ({ sumRevenueEvents: async () => 0 }));
vi.mock("@/lib/admin/finance-settings", () => ({ getFinanceSettings: h.settings }));

import { STANDAARD_POSTEN, KOSTEN_NIET_INGEVULD, breakEvenOmzetPerMaand, financienBronTekst, operationeleMaandkosten, voorbelastingPerMaand, type KostenPost } from "@/lib/admin/kosten";
import { operationeleKosten } from "@/lib/admin/kosten-opslag";
import { financeOverview } from "@/lib/admin/finance";

const INSTELLING = { stripeFeePct: 0.015, vatInputPct: 0.21, operationalMonthlyCents: 5_000, taxReservePct: 0.2, uitzendMarkupRate: null };
const opgeslagen = (posten: KostenPost[]) => ({ posten, versie: 2, bijgewerktOp: "2026-11-13T09:00:00.000Z" });
// 30 dagen: Financien rekent dan met precies 1 maand
const VAN = new Date("2026-11-01T00:00:00+01:00");
const TOT = new Date("2026-12-01T00:00:00+01:00");

afterEach(() => {
  vi.clearAllMocks();
  h.groupBy.mockResolvedValue([]);
});

const post = (p: Partial<KostenPost>): KostenPost => ({ id: "x", naam: "X", soort: "handmatig", bedragCent: 10_000, munt: "EUR", per: "maand", btwPct: null, bron: "test", datum: "2026-11-13", ...p });

describe("voorbelasting per post", () => {
  it("alleen TransIP (21%) telt mee; Claude (btw null) geeft 0 en wordt als onbekend geteld", () => {
    const r = voorbelastingPerMaand([post({ id: "transip", btwPct: 21 }), post({ id: "claude", btwPct: null })]);
    expect(r).toEqual({ cent: 2_100, zonderBtw: 1 });
  });

  it("elke post tegen zijn eigen percentage, afgerond per post", () => {
    expect(voorbelastingPerMaand([post({ btwPct: 9, bedragCent: 999 }), post({ id: "b", btwPct: 21, bedragCent: 999 })]).cent).toBe(90 + 210);
    expect(voorbelastingPerMaand([post({ btwPct: 0 })])).toEqual({ cent: 0, zonderBtw: 0 });
  });

  it("jaarbedragen per maand; schattingen, onbekende bedragen en eenmalige posten doen niet mee", () => {
    const r = voorbelastingPerMaand([
      post({ id: "jaar", per: "jaar", bedragCent: 12_000, btwPct: 21 }),
      post({ id: "schat", soort: "schatting", btwPct: 21 }),
      post({ id: "leeg", bedragCent: null, btwPct: 21 }),
      post({ id: "een", per: "eenmalig", btwPct: 21 }),
    ]);
    expect(r).toEqual({ cent: 210, zonderBtw: 0 });
  });

  it("de standaardlijst: alleen de drie TransIP-posten, drie posten met onbekende btw", () => {
    expect(voorbelastingPerMaand(STANDAARD_POSTEN)).toEqual({ cent: 3_670, zonderBtw: 3 });
  });
});

describe("het maandtotaal voor Financien", () => {
  it("telt alleen opgegeven posten mee: geen schattingen, geen onbekende bedragen, geen eenmalige", () => {
    const m = operationeleMaandkosten(STANDAARD_POSTEN);
    expect(m?.maandCent).toBe(39_008);
    expect(m?.onbekend).toBe(5);
    // de Delaware-schattingen zitten er niet in (die zijn samen 46.000 per jaar)
    const zonderSchatting = operationeleMaandkosten(STANDAARD_POSTEN.filter((p) => p.soort === "handmatig"));
    expect(zonderSchatting?.maandCent).toBe(39_008);
  });

  it("zonder iets te tellen: null (geen stille 0)", () => {
    expect(operationeleMaandkosten([])).toBeNull();
    expect(operationeleMaandkosten(STANDAARD_POSTEN.filter((p) => p.soort === "schatting"))).toBeNull();
    expect(operationeleMaandkosten(STANDAARD_POSTEN.map((p) => ({ ...p, bedragCent: null })))).toBeNull();
  });

  it("break-even: de eigen omzet per maand die de vaste lasten dekt", () => {
    expect(breakEvenOmzetPerMaand(39_008)).toBe(39_008);
    expect(breakEvenOmzetPerMaand(-5)).toBe(0);
  });

  it("de bron met de Amsterdamse datum", () => {
    expect(financienBronTekst("2026-11-13T09:00:00.000Z")).toBe("bron: Beheer → Kosten, bijgewerkt 13 nov");
    // vlak voor middernacht UTC is het in Amsterdam al de volgende dag
    expect(financienBronTekst("2026-11-13T23:30:00.000Z")).toBe("bron: Beheer → Kosten, bijgewerkt 14 nov");
    expect(financienBronTekst(null)).toBe("bron: Beheer → Kosten, bijgewerkt datum onbekend");
  });
});

describe("operationeleKosten (lezen uit de opslag)", () => {
  it("een opgeslagen lijst geeft het maandtotaal met bron en datum", async () => {
    h.kvGet.mockResolvedValue(opgeslagen(STANDAARD_POSTEN));
    const r = await operationeleKosten();
    expect(r).toEqual({ bron: "kosten", maandCent: 39_008, bijgewerktOp: "2026-11-13T09:00:00.000Z", onbekend: 5, geteld: 6, voorbelastingMaandCent: 3_670, zonderBtw: 3 });
  });

  it("nog niets opgeslagen: de instelling blijft en er is een melding", async () => {
    h.kvGet.mockResolvedValue(null);
    expect(await operationeleKosten()).toEqual({ bron: "instelling", melding: KOSTEN_NIET_INGEVULD });
  });

  it("een storing in de opslag: dezelfde melding, geen 0", async () => {
    h.kvGet.mockRejectedValue(new Error("kv weg"));
    expect(await operationeleKosten()).toEqual({ bron: "instelling", melding: KOSTEN_NIET_INGEVULD });
  });

  it("een lijst waarin niets te tellen valt: ook 'niet ingevuld'", async () => {
    h.kvGet.mockResolvedValue(opgeslagen(STANDAARD_POSTEN.map((p) => ({ ...p, bedragCent: null }))));
    expect((await operationeleKosten()).bron).toBe("instelling");
  });
});

describe("financeOverview met de koppeling", () => {
  it("rekent met het totaal uit Kosten: kosten, break-even en bron kloppen", async () => {
    h.settings.mockResolvedValue(INSTELLING);
    h.kvGet.mockResolvedValue(opgeslagen(STANDAARD_POSTEN));
    const o = await financeOverview(VAN, TOT);
    expect(o.months).toBe(1);
    expect(o.costs.operational).toBe(39_008);
    expect(o.operationalSource).toEqual({
      monthlyCents: 39_008,
      soort: "kosten",
      tekst: "bron: Beheer → Kosten, bijgewerkt 13 nov",
      onbekend: 5,
      zonderBtw: 3,
      breakEvenMonthlyCents: 39_008,
    });
    // voorbelasting alleen over TransIP (21%), per post; Claude, Twilio en Apple (btw null) geven 0
    expect(o.vat.inputEstimate).toBe(3_670);
    // zonder omzet is de winst precies min de vaste lasten (de Stripe-kosten zijn 0 bij 0 gefactureerd)
    expect(o.netProfit).toBe(-39_008);
  });

  it("de Stripe-kosten tellen niet mee in de voorbelasting", async () => {
    h.settings.mockResolvedValue(INSTELLING);
    h.kvGet.mockResolvedValue(opgeslagen(STANDAARD_POSTEN));
    h.groupBy.mockResolvedValue([{ type: "PLATFORM_FEE", _sum: { subtotalCents: 100_000, vatCents: 21_000, totalCents: 121_000 } }]);
    const o = await financeOverview(VAN, TOT);
    expect(o.costs.stripe).toBe(1_815);
    // zonder Stripe in de voorbelasting: dezelfde 3.670 als zonder omzet
    expect(o.vat.inputEstimate).toBe(3_670);
  });

  it("twee maanden rekenen twee keer het maandtotaal, ook voor de voorbelasting", async () => {
    h.settings.mockResolvedValue(INSTELLING);
    h.kvGet.mockResolvedValue(opgeslagen(STANDAARD_POSTEN));
    const o = await financeOverview(VAN, new Date("2027-01-01T00:00:00+01:00"));
    expect(o.months).toBe(2);
    expect(o.costs.operational).toBe(2 * 39_008);
    expect(o.vat.inputEstimate).toBe(2 * 3_670);
  });

  it("geen lijst: de eigen instelling blijft gelden en de melding staat erbij", async () => {
    h.settings.mockResolvedValue(INSTELLING);
    h.kvGet.mockResolvedValue(null);
    const o = await financeOverview(VAN, TOT);
    expect(o.costs.operational).toBe(5_000);
    expect(o.operationalSource.soort).toBe("instelling");
    expect(o.operationalSource.tekst).toBe(KOSTEN_NIET_INGEVULD);
    expect(o.operationalSource.breakEvenMonthlyCents).toBe(5_000);
    // zonder lijst is er geen btw per post bekend: de eigen instelling (vatInputPct) blijft over de vaste lasten, Stripe niet
    expect(o.vat.inputEstimate).toBe(Math.round(5_000 * 0.21));
  });

  it("een storing bij het lezen laat het overzicht gewoon werken, met de melding", async () => {
    h.settings.mockResolvedValue(INSTELLING);
    h.kvGet.mockRejectedValue(new Error("kv weg"));
    const o = await financeOverview(VAN, TOT);
    expect(o.costs.operational).toBe(5_000);
    expect(o.operationalSource.tekst).toBe(KOSTEN_NIET_INGEVULD);
  });
});
