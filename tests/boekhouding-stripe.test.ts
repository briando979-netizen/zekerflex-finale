import { beforeEach, describe, expect, it, vi } from "vitest";

// Stripe-uitbetalingen in de boekhouding: het csv-rapport lezen, de boeking bouwen (fee/netto, negatief, valuta),
// idempotent boeken en de route (alleen PLATFORM_ADMIN, geen bedragen in het auditspoor). Nep-gegevens: geen Stripe.

const m = vi.hoisted(() => ({
  recordAudit: vi.fn(async () => undefined),
  rollen: [] as string[][],
  boek: vi.fn(),
  boekAdministratie: { findUnique: vi.fn() },
  boekRekening: { findMany: vi.fn() },
}));

vi.mock("@/lib/audit", () => ({ recordAudit: m.recordAudit }));
vi.mock("@/lib/prisma", () => ({ prisma: { boekAdministratie: m.boekAdministratie, boekRekening: m.boekRekening } }));
vi.mock("@/lib/boekhouding/boek", () => ({ boek: m.boek }));
vi.mock("@/lib/auth/handlers", () => ({
  withAdminAccess:
    (roles: string[], handler: (req: Request, ctx: { principal: { userId: string } }) => Promise<Response>) => {
      m.rollen.push(roles);
      return async (req: Request) => {
        try {
          return await handler(req, { principal: { userId: "admin-1" } });
        } catch (e) {
          const f = e as { status?: number; code?: string; message: string };
          return Response.json({ code: f.code, message: f.message }, { status: f.status ?? 500 });
        }
      };
    },
}));

const { parseStripePayoutRapport, stripeBedragNaarCenten } = await import("@/lib/boekhouding/stripe/rapport");
const { bouwPayoutBoeking } = await import("@/lib/boekhouding/stripe/boeking-kern");
const { boekStripeUitbetalingen, importeerStripeRapport } = await import("@/lib/boekhouding/stripe/import");
const route = await import("@/app/api/admin/boekhouding/stripe/route");
const { valideerBoeking } = await import("@/lib/boekhouding/sluiting");

const KOP = "payout_id,gross,fee,net,currency,created,description";
const ctx = {
  administratieId: "adm1",
  valuta: "EUR",
  aangemaaktDoor: "admin-1",
  rekeningId: (n: string) => `r${n}`,
};
const p = (o: Partial<Parameters<typeof bouwPayoutBoeking>[0]> = {}) => ({
  payoutId: "po_1ABC",
  boekdag: "2026-11-02",
  grossCents: 10000,
  feeCents: 250,
  netCents: 9750,
  valuta: "EUR",
  ...o,
});

describe("rapport lezen", () => {
  it("leest bedragen in centen", () => {
    expect(stripeBedragNaarCenten("12.50")).toBe(1250);
    expect(stripeBedragNaarCenten("12,5")).toBe(1250);
    expect(stripeBedragNaarCenten("-0.07")).toBe(-7);
    expect(stripeBedragNaarCenten("1234")).toBe(123400);
    expect(stripeBedragNaarCenten("1.234,56")).toBeNull();
    expect(stripeBedragNaarCenten("1.005")).toBeNull();
    expect(stripeBedragNaarCenten("")).toBeNull();
  });

  it("leest een rapport, met de Amsterdamse dag van een UTC-tijd", () => {
    const r = parseStripePayoutRapport(`${KOP}\npo_1ABC,100.00,2.50,97.50,eur,2026-11-02 23:30:00,Uitbetaling\n`);
    expect(r.fouten).toEqual([]);
    expect(r.uitbetalingen).toEqual([p({ boekdag: "2026-11-03" })]);
  });

  it("weigert een onbekend formaat", () => {
    expect(() => parseStripePayoutRapport("naam,bedrag\nx,1")).toThrow(/Formaat niet herkend/);
    expect(() => parseStripePayoutRapport("payout_id,gross,fee,net\npo_1,1,0,1")).toThrow(/Formaat niet herkend/);
    expect(() => parseStripePayoutRapport("")).toThrow(/leeg/);
  });

  it("meldt een regel die niet klopt en leest de rest", () => {
    const r = parseStripePayoutRapport(
      `${KOP}\npo_1,100.00,2.50,90.00,eur,2026-11-02,x\npo_2,10.00,0.00,10.00,eur,2026-11-03,x\n,1,0,1,eur,2026-11-03,x\npo_3,10.00,0,10.00,eur,geen-datum,x`,
    );
    expect(r.uitbetalingen.map((u) => u.payoutId)).toEqual(["po_2"]);
    expect(r.fouten.map((f) => f.regel)).toEqual([2, 4, 5]);
    expect(r.fouten[0]?.fout).toMatch(/gross min fee/);
  });

  it("telt dezelfde payout twee keer maar één keer, en weigert afwijkende bedragen", () => {
    const r = parseStripePayoutRapport(`${KOP}\npo_1,10.00,1.00,9.00,eur,2026-11-02,x\npo_1,10.00,1.00,9.00,eur,2026-11-02,x\npo_1,20.00,1.00,19.00,eur,2026-11-02,x`);
    expect(r.uitbetalingen).toHaveLength(1);
    expect(r.fouten).toHaveLength(1);
  });
});

describe("boeking bouwen", () => {
  it("boekt bank, kosten en Stripe-saldo en sluit op nul", () => {
    const b = bouwPayoutBoeking(p(), ctx);
    expect(b.bron).toBe("BANK");
    expect(b.bronId).toBe("stripe-payout:po_1ABC");
    expect(b.regels).toEqual([
      { rekeningId: "r1100", debetCents: 9750 },
      { rekeningId: "r4200", debetCents: 250 },
      { rekeningId: "r1150", creditCents: 10000 },
    ]);
    expect(b.reden).toMatch(/accountant/);
    expect(valideerBoeking(b, "EUR")).toEqual({ debetTotaalCents: 10000, creditTotaalCents: 10000 });
  });

  it("laat de kostenregel weg zonder fee", () => {
    const b = bouwPayoutBoeking(p({ feeCents: 0, netCents: 10000 }), ctx);
    expect(b.regels).toHaveLength(2);
    expect(b.reden).toBeUndefined();
  });

  it("boekt een negatieve payout (terugboeking) met omgekeerde kanten", () => {
    const b = bouwPayoutBoeking(p({ grossCents: -5000, feeCents: 0, netCents: -5000 }), ctx);
    expect(b.regels).toEqual([
      { rekeningId: "r1100", creditCents: 5000 },
      { rekeningId: "r1150", debetCents: 5000 },
    ]);
    expect(valideerBoeking(b, "EUR").debetTotaalCents).toBe(5000);
  });

  it("weigert een andere valuta, een som die niet klopt en nul", () => {
    expect(() => bouwPayoutBoeking(p({ valuta: "USD" }), ctx)).toThrow(/boekt in EUR/);
    expect(() => bouwPayoutBoeking(p({ netCents: 1 }), ctx)).toThrow(/gross min fee/i);
    expect(() => bouwPayoutBoeking(p({ grossCents: 0, feeCents: 0, netCents: 0 }), ctx)).toThrow(/nul euro/);
    expect(() => bouwPayoutBoeking(p({ grossCents: 10.5, feeCents: 0.5, netCents: 10 }), ctx)).toThrow(/geheel aantal centen/);
  });

  it("zet geen persoonsgegevens in de omschrijving", () => {
    expect(bouwPayoutBoeking(p(), ctx).omschrijving).toBe("Stripe-uitbetaling po_1ABC");
  });
});

describe("boeken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.boekAdministratie.findUnique.mockResolvedValue({ id: "adm1", valuta: "EUR", actief: true });
    m.boekRekening.findMany.mockResolvedValue([
      { id: "r1100", nummer: "1100" },
      { id: "r1150", nummer: "1150" },
      { id: "r4200", nummer: "4200" },
    ]);
    m.boek.mockResolvedValue({ boekingId: "b1", boekstuk: "BK-1", nieuw: true });
  });

  it("telt nieuw en al bekend (idempotent)", async () => {
    m.boek.mockResolvedValueOnce({ boekingId: "b1", boekstuk: "BK-1", nieuw: true }).mockResolvedValueOnce({ boekingId: "b2", boekstuk: "BK-2", nieuw: false });
    const u = await boekStripeUitbetalingen("adm1", [p(), p({ payoutId: "po_2" })], "admin-1");
    expect(u).toMatchObject({ totaal: 2, nieuw: 1, alBekend: 1, doorAccountantTeBevestigen: 1, fouten: [] });
  });

  it("meldt een fout per payout en gaat door", async () => {
    const u = await boekStripeUitbetalingen("adm1", [p({ valuta: "USD" }), p({ payoutId: "po_2" })], "admin-1");
    expect(u.nieuw).toBe(1);
    expect(u.fouten).toHaveLength(1);
    expect(u.fouten[0]?.payoutId).toBe("po_1ABC");
  });

  it("weigert een administratie zonder de nodige rekening en een inactieve", async () => {
    m.boekRekening.findMany.mockResolvedValue([]);
    const u = await boekStripeUitbetalingen("adm1", [p()], "admin-1");
    expect(u.fouten[0]?.fout).toMatch(/ontbreekt/);
    m.boekAdministratie.findUnique.mockResolvedValue({ id: "adm1", valuta: "EUR", actief: false });
    await expect(boekStripeUitbetalingen("adm1", [p()], "admin-1")).rejects.toThrow(/niet actief/);
  });

  it("neemt de regelfouten van het rapport mee in de uitkomst", async () => {
    const u = await importeerStripeRapport("adm1", `${KOP}\npo_1,10.00,1.00,9.00,eur,2026-11-02,x\npo_2,x,0,1,eur,2026-11-02,x`, "admin-1");
    expect(u.totaal).toBe(2);
    expect(u.nieuw).toBe(1);
    expect(u.fouten).toEqual([{ payoutId: null, regel: 3, fout: expect.stringMatching(/bedrag/) }]);
  });
});

describe("route", () => {
  const stuur = (csv: string | null, adm = "cm0adm1234567890") => {
    const form = new FormData();
    form.set("administratieId", adm);
    if (csv !== null) form.set("bestand", new File([csv], "rapport.csv", { type: "text/csv" }));
    return (route.POST as (r: Request) => Promise<Response>)(new Request("http://localhost/x", { method: "POST", body: form }));
  };
  beforeEach(() => {
    vi.clearAllMocks();
    m.boekAdministratie.findUnique.mockResolvedValue({ id: "adm1", valuta: "EUR", actief: true });
    m.boekRekening.findMany.mockResolvedValue([
      { id: "r1100", nummer: "1100" },
      { id: "r1150", nummer: "1150" },
      { id: "r4200", nummer: "4200" },
    ]);
    m.boek.mockResolvedValue({ boekingId: "b1", boekstuk: "BK-1", nieuw: true });
  });

  it("is alleen voor PLATFORM_ADMIN", () => {
    expect(m.rollen).toEqual([["PLATFORM_ADMIN"]]);
  });

  it("boekt en zet alleen aantallen in het auditspoor", async () => {
    const res = await stuur(`${KOP}\npo_1,10.00,1.00,9.00,eur,2026-11-02,Jan Jansen`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const tekst = JSON.stringify(m.recordAudit.mock.calls);
    expect(tekst).not.toContain("po_1");
    expect(tekst).not.toContain("Jansen");
    expect(tekst).not.toContain("1000");
  });

  it("geeft een Nederlandse fout bij een onbekend formaat, zonder bestand of zonder administratie", async () => {
    const r1 = await stuur("a,b\n1,2");
    expect(r1.status).toBe(422);
    expect(((await r1.json()) as { message: string }).message).toMatch(/Formaat niet herkend/);
    expect((await stuur(null)).status).toBe(422);
    expect((await stuur("x", "!")).status).toBe(422);
    expect(m.recordAudit).not.toHaveBeenCalled();
  });
});
