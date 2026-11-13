import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/storage/kv", () => ({ kvGet: vi.fn(async () => null), kvSet: vi.fn(async () => undefined) }));
const transip = vi.hoisted(() => ({ configured: vi.fn(() => true), invoices: vi.fn() }));
vi.mock("@/lib/mail/hosting/transip", () => ({ transipConfigured: transip.configured, listInvoices: transip.invoices }));

import {
  STANDAARD_POSTEN,
  bedragTekst,
  bronRegel,
  datumKort,
  euroCent,
  facturenPerMaand,
  pasToe,
  perJaarCent,
  perMaandCent,
  postId,
  splits,
  totalen,
  type KostenPost,
  type KostenStand,
} from "@/lib/admin/kosten";
import { postSchema, wijzigingSchema } from "@/lib/admin/kosten-opslag";
import { transipFacturen } from "@/lib/admin/kosten-transip";

// Beheer -> Kosten: de pure kern (opgegeven en geschat strikt gescheiden, onbekend blijft onbekend) en de TransIP-lezer.

const post = (p: Partial<KostenPost>): KostenPost => ({ id: "x", naam: "X", soort: "handmatig", bedragCent: 1000, munt: "EUR", per: "maand", btwPct: null, bron: "test", datum: "2026-11-13", ...p });

afterEach(() => {
  vi.clearAllMocks();
  (globalThis as { __zfKostenTransip?: unknown }).__zfKostenTransip = undefined;
});

describe("rekenen", () => {
  it("rekent maand en jaar om, en dollars met de aanname 0,92", () => {
    expect(perMaandCent(post({ bedragCent: 1200, per: "jaar" }))).toBe(100);
    expect(perJaarCent(post({ bedragCent: 1000, per: "maand" }))).toBe(12_000);
    expect(euroCent(post({ bedragCent: 770, munt: "USD" }))).toBe(708);
    expect(perMaandCent(post({ bedragCent: 1000, per: "eenmalig" }))).toBeNull();
  });

  it("een onbekend bedrag blijft null en wordt nooit verzonnen", () => {
    expect(euroCent(post({ bedragCent: null }))).toBeNull();
    expect(perMaandCent(post({ bedragCent: null }))).toBeNull();
    expect(bedragTekst(post({ bedragCent: null }))).toBe("bedrag onbekend");
  });

  it("totalen: excl. en incl. btw per post, onbekend en eenmalig tellen niet mee", () => {
    const t = totalen([
      post({ id: "a", bedragCent: 10_000, btwPct: 21 }),
      post({ id: "b", bedragCent: 10_000, btwPct: null }),
      post({ id: "c", bedragCent: null }),
      post({ id: "d", bedragCent: 500, per: "eenmalig" }),
      post({ id: "e", bedragCent: 1200, munt: "USD", per: "jaar", btwPct: 0 }),
    ]);
    expect(t.maandExclCent).toBe(10_000 + 10_000 + 92);
    expect(t.maandInclCent).toBe(12_100 + 10_000 + 92);
    expect(t.jaarExclCent).toBe(120_000 + 120_000 + 1104);
    expect(t.geteld).toBe(3);
    expect(t.onbekend).toBe(1);
    expect(t.eenmalig).toBe(1);
    expect(t.omgerekend).toBe(1);
    expect(t.zonderBtw).toBe(1);
  });
});

describe("de startgegevens", () => {
  it("elke post heeft een bron, en schattingen staan apart van de opgaven", () => {
    for (const p of STANDAARD_POSTEN) expect(p.bron.length, p.id).toBeGreaterThan(3);
    const { vaststaand, geschat } = splits(STANDAARD_POSTEN);
    expect(geschat.map((p) => p.id).sort()).toEqual(["delaware-franchise-tax", "delaware-registered-agent"]);
    expect(vaststaand.every((p) => p.soort === "handmatig")).toBe(true);
    for (const p of geschat) expect(p.bron).toContain("accountant moet bevestigen");
  });

  it("onbekende posten hebben geen bedrag: Gemini, Stripe, Atlas, Google Play en Twilio-gebruik", () => {
    for (const id of ["gemini", "stripe-kosten", "atlas-kosten", "google-play", "twilio-gebruik"]) {
      expect(STANDAARD_POSTEN.find((p) => p.id === id)?.bedragCent, id).toBeNull();
    }
  });

  it("het vaststaande totaal bevat geen schatting en klopt met de opgaven", () => {
    const { vaststaand, geschat } = splits(STANDAARD_POSTEN);
    const t = totalen(vaststaand);
    expect(t.maandExclCent).toBe(39_008);
    expect(t.maandInclCent).toBe(42_678);
    expect(t.jaarExclCent).toBe(468_095);
    expect(t.jaarInclCent).toBe(512_132);
    expect(t.onbekend).toBe(5);
    expect(t.eenmalig).toBe(1);
    const g = totalen(geschat);
    expect(g.jaarExclCent).toBe(46_000);
  });

  it("de bron met datum staat erbij, en een onbekende datum zegt dat", () => {
    expect(bronRegel({ bron: "opgave eigenaar", datum: "2026-11-13" })).toBe("opgave eigenaar, 13 nov");
    expect(datumKort(null)).toBe("datum onbekend");
    expect(datumKort("onzin")).toBe("datum onbekend");
  });
});

describe("wijzigen", () => {
  const stand: KostenStand = { posten: [post({ id: "a" }), post({ id: "b", naam: "B" })], versie: 3, bijgewerktOp: null };
  const nu = new Date("2026-11-13T10:00:00+01:00");

  it("upsert vervangt of voegt toe en verhoogt de versie; verwijderen haalt hem weg", () => {
    const na1 = pasToe(stand, { upsert: post({ id: "a", naam: "Nieuw" }) }, nu);
    expect(na1.versie).toBe(4);
    expect(na1.posten.find((p) => p.id === "a")?.naam).toBe("Nieuw");
    expect(na1.posten).toHaveLength(2);
    const na2 = pasToe(na1, { upsert: post({ id: "c" }) }, nu);
    expect(na2.posten).toHaveLength(3);
    const na3 = pasToe(na2, { verwijder: "a" }, nu);
    expect(na3.posten.map((p) => p.id)).toEqual(["b", "c"]);
    expect(na3.bijgewerktOp).toBe("2026-11-13T09:00:00.000Z");
  });

  it("maakt een nette, unieke sleutel", () => {
    expect(postId("Nieuwe Post", [])).toBe("nieuwe-post");
    expect(postId("Café & Co", ["cafe-co"])).toBe("cafe-co-2");
    expect(postId("???", [])).toBe("post");
  });
});

describe("validatie", () => {
  const goed = { id: "claude", naam: "Claude", soort: "handmatig", bedragCent: 20_000, munt: "EUR", per: "maand", btwPct: null, bron: "opgave", datum: "2026-11-13" };

  it("accepteert een goede post en weigert rommel", () => {
    expect(postSchema.safeParse(goed).success).toBe(true);
    expect(postSchema.safeParse({ ...goed, naam: "  " }).success).toBe(false);
    expect(postSchema.safeParse({ ...goed, bron: "" }).success).toBe(false);
    expect(postSchema.safeParse({ ...goed, bedragCent: -1 }).success).toBe(false);
    expect(postSchema.safeParse({ ...goed, bedragCent: 1.5 }).success).toBe(false);
    expect(postSchema.safeParse({ ...goed, munt: "GBP" }).success).toBe(false);
    expect(postSchema.safeParse({ ...goed, datum: "13-11-2026" }).success).toBe(false);
    expect(postSchema.safeParse({ ...goed, id: "Heel Raar!" }).success).toBe(false);
  });

  it("een onbekend bedrag (null) en een onbekende datum zijn toegestaan", () => {
    expect(postSchema.safeParse({ ...goed, bedragCent: null, datum: null }).success).toBe(true);
  });

  it("een wijziging is precies een upsert of een verwijdering", () => {
    expect(wijzigingSchema.safeParse({ upsert: goed }).success).toBe(true);
    expect(wijzigingSchema.safeParse({ verwijder: "claude" }).success).toBe(true);
    expect(wijzigingSchema.safeParse({ verwijder: "claude", upsert: goed }).success).toBe(false);
    expect(wijzigingSchema.safeParse({}).success).toBe(false);
  });
});

describe("gemeten TransIP-facturen", () => {
  it("groepeert per maand, nieuwste eerst", () => {
    const m = facturenPerMaand([
      { nummer: "1", datum: "2026-09-02", status: "payed", exclCent: 1000, inclCent: 1210 },
      { nummer: "2", datum: "2026-10-02", status: "payed", exclCent: 2000, inclCent: 2420 },
      { nummer: "3", datum: "2026-10-20", status: "payed", exclCent: 500, inclCent: 605 },
    ]);
    expect(m.map((x) => x.maand)).toEqual(["2026-10", "2026-09"]);
    expect(m[0]).toEqual({ maand: "2026-10", exclCent: 2500, inclCent: 3025, aantal: 2 });
  });

  it("leest een keer per uur: de tweede aanroep komt uit het geheugen", async () => {
    transip.invoices.mockResolvedValue([{ nummer: "1", datum: "2026-11-02", status: "payed", exclCent: 1000, inclCent: 1210 }]);
    const nu = Date.parse("2026-11-13T10:00:00+01:00");
    const a = await transipFacturen(nu);
    const b = await transipFacturen(nu + 30 * 60_000);
    expect(a.ok && b.ok).toBe(true);
    expect(transip.invoices).toHaveBeenCalledTimes(1);
    await transipFacturen(nu + 61 * 60_000);
    expect(transip.invoices).toHaveBeenCalledTimes(2);
  });

  it("bij een storing: een nette melding zonder details, de pagina blijft staan", async () => {
    transip.invoices.mockRejectedValue(new TypeError("fetch failed https://api.transip.nl/?token=geheim"));
    const r = await transipFacturen(Date.parse("2026-11-13T10:00:00+01:00"));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.melding).toBe("TransIP is nu niet bereikbaar, probeer het later.");
      expect(r.melding).not.toContain("geheim");
    }
  });

  it("zonder koppeling: een melding en geen aanroep", async () => {
    transip.configured.mockReturnValueOnce(false);
    const r = await transipFacturen(Date.parse("2026-11-13T10:00:00+01:00"));
    expect(r.ok).toBe(false);
    expect(transip.invoices).not.toHaveBeenCalled();
  });
});
