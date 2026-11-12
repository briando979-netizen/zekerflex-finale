import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  gedaan: new Set<string>(),
  geboekt: [] as any[],
  tegen: [] as string[],
  facturen: [] as any[],
  boekingen: new Map<string, string>(),
  faalOp: null as string | null,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    boekAdministratie: {
      findUnique: async () => ({ id: "adm1", valuta: "EUR", actief: true, platformTenantId: "platform" }),
    },
    boekRekening: {
      findMany: async () => ["1200", "2300", "1150", "8000"].map((nummer) => ({ id: `rek${nummer}`, nummer })),
    },
    boekBtwCode: {
      findMany: async () => ["NL21-V", "NL09-V", "NL00-V"].map((code) => ({ id: `btw${code}`, code })),
    },
    invoice: { findMany: async () => m.facturen },
    boekBoeking: {
      findUnique: async ({ where }: any) => {
        const k = where.administratieId_bron_bronId;
        const id = m.boekingen.get(`${k.bron}|${k.bronId}`);
        return id ? { id } : null;
      },
    },
  },
}));

vi.mock("@/lib/boekhouding/boek", () => ({
  boek: async (invoer: any) => {
    if (m.faalOp === invoer.bronId) throw new Error("De periode is vergrendeld.");
    const sleutel = `${invoer.bron}|${invoer.bronId}`;
    if (m.gedaan.has(sleutel)) return { boekingId: sleutel, boekstuk: "x", nieuw: false };
    m.gedaan.add(sleutel);
    m.boekingen.set(sleutel, sleutel);
    m.geboekt.push(invoer);
    return { boekingId: sleutel, boekstuk: "x", nieuw: true };
  },
  keerOm: async (id: string) => {
    if (m.tegen.includes(id)) return { boekingId: "t", boekstuk: "t", nieuw: false };
    m.tegen.push(id);
    return { boekingId: "t", boekstuk: "t", nieuw: true };
  },
}));

import {
  FACTUURSOORTEN_VOOR_OMZET,
  bouwBetalingBoeking,
  bouwFactuurBoeking,
  btwCodeVoorFactuur,
  isBoekbaarAlsOmzet,
  type FactuurGegevens,
} from "@/lib/boekhouding/inkomsten-kern";
import { boekOpenFacturen } from "@/lib/boekhouding/inkomsten";
import { valideerBoeking } from "@/lib/boekhouding/sluiting";

const ctx = {
  administratieId: "adm1",
  valuta: "EUR",
  rekeningId: (n: string) => `rek${n}`,
  btwCodeId: (c: string) => `btw${c}`,
};

function factuur(extra: Partial<FactuurGegevens> = {}): FactuurGegevens {
  return {
    id: "inv1",
    number: "ZF-PF-2026-000001",
    type: "PLATFORM_FEE",
    status: "ISSUED",
    currency: "EUR",
    vatTreatment: "STANDARD_RATE",
    vatRate: 0.21,
    subtotalCents: 10000,
    vatCents: 2100,
    totalCents: 12100,
    issuedAt: new Date("2026-04-10T10:00:00+02:00"),
    createdAt: new Date("2026-04-10T10:00:00+02:00"),
    paidAt: null,
    stripePaymentIntentId: null,
    ...extra,
  };
}

beforeEach(() => {
  m.gedaan.clear();
  m.geboekt.length = 0;
  m.tegen.length = 0;
  m.boekingen.clear();
  m.facturen = [];
  m.faalOp = null;
});

describe("welke facturen omzet zijn", () => {
  it("alleen de platformfee; de rest is een expliciete keuze voor later", () => {
    expect(FACTUURSOORTEN_VOOR_OMZET).toEqual(["PLATFORM_FEE"]);
    for (const type of ["SELF_BILL_FREELANCER", "CANCELLATION_PENALTY", "UITZEND_FEE", "DOMEIN", "constructor"]) {
      expect(isBoekbaarAlsOmzet({ type, status: "ISSUED" })).toBe(false);
    }
    expect(isBoekbaarAlsOmzet({ type: "PLATFORM_FEE", status: "DRAFT" })).toBe(false);
    expect(isBoekbaarAlsOmzet({ type: "PLATFORM_FEE", status: "PAID" })).toBe(true);
  });
});

describe("bouwFactuurBoeking", () => {
  it("21%: debiteuren 12100 debet, omzet 10000 credit, btw 2100 credit, sluit op nul", () => {
    const b = bouwFactuurBoeking(factuur(), ctx, "2026-04-10");
    expect(b).not.toBeNull();
    expect(b!.bron).toBe("FACTUUR");
    expect(b!.bronId).toBe("inv1");
    expect(b!.dagboek).toBe("VERKOOP");
    expect(b!.omschrijving).toBe("Factuur ZF-PF-2026-000001");
    expect(b!.regels).toEqual([
      { rekeningId: "rek1200", debetCents: 12100, postSleutel: "factuur:inv1" },
      { rekeningId: "rek8000", creditCents: 10000, btwCodeId: "btwNL21-V", btwBasisCents: 10000 },
      { rekeningId: "rek2300", creditCents: 2100, btwCodeId: "btwNL21-V", isBtwRegel: true },
    ]);
    expect(() => valideerBoeking(b!, "EUR")).not.toThrow();
  });

  it("verlegd en 0%: geen btw-regel, code NL00-V", () => {
    const b = bouwFactuurBoeking(
      factuur({ vatTreatment: "REVERSE_CHARGE", vatRate: 0, vatCents: 0, totalCents: 10000 }),
      ctx,
      "2026-04-10",
    )!;
    expect(b.regels).toHaveLength(2);
    expect(b.regels[1]).toMatchObject({ creditCents: 10000, btwCodeId: "btwNL00-V" });
    expect(() => valideerBoeking(b, "EUR")).not.toThrow();
    expect(btwCodeVoorFactuur(factuur({ vatTreatment: "STANDARD_RATE", vatRate: 0, vatCents: 0 }))).toBe("NL00-V");
  });

  it("afronding: de bedragen van de factuur worden overgenomen, ook bij oneven centen", () => {
    // 3,50 x 1,25 uur = 4,375 -> 438 cent (factuur rondt zelf af); btw 21% = 92 cent
    const b = bouwFactuurBoeking(factuur({ subtotalCents: 438, vatCents: 92, totalCents: 530 }), ctx, "2026-04-10")!;
    expect(b.regels.map((r) => (r.debetCents ?? 0) - (r.creditCents ?? 0))).toEqual([530, -438, -92]);
    expect(() => valideerBoeking(b, "EUR")).not.toThrow();
  });

  it("weigert een factuur die niet klopt of een onbekend tarief, met Nederlandse tekst", () => {
    expect(() => bouwFactuurBoeking(factuur({ totalCents: 12000 }), ctx, "2026-04-10")).toThrow(/niet gelijk aan het totaal/);
    expect(() => bouwFactuurBoeking(factuur({ vatRate: 0.17 }), ctx, "2026-04-10")).toThrow(/geen 21%, 9% of 0%/);
    expect(() => bouwFactuurBoeking(factuur({ subtotalCents: -100, vatCents: 0, totalCents: -100 }), ctx, "2026-04-10")).toThrow(/negatief/);
    expect(() => bouwFactuurBoeking(factuur({ type: "SELF_BILL_FREELANCER" }), ctx, "2026-04-10")).toThrow(/niet als omzet/);
  });

  it("een factuur van 0 euro geeft niets te boeken", () => {
    expect(bouwFactuurBoeking(factuur({ subtotalCents: 0, vatCents: 0, totalCents: 0 }), ctx, "2026-04-10")).toBeNull();
  });
});

describe("bouwBetalingBoeking", () => {
  const betaald = () => factuur({ status: "PAID", paidAt: new Date("2026-04-20T12:00:00+02:00"), stripePaymentIntentId: "pi_1" });

  it("Stripe-saldo debet, debiteuren credit met dezelfde postSleutel", () => {
    const b = bouwBetalingBoeking(betaald(), ctx, "2026-04-20")!;
    expect(b.bron).toBe("FACTUUR_BETALING");
    expect(b.bronId).toBe("inv1");
    expect(b.dagboek).toBe("BANK");
    expect(b.omschrijving).toBe("Betaling factuur ZF-PF-2026-000001");
    expect(b.regels).toEqual([
      { rekeningId: "rek1150", debetCents: 12100 },
      { rekeningId: "rek1200", creditCents: 12100, postSleutel: "factuur:inv1" },
    ]);
    expect(() => valideerBoeking(b, "EUR")).not.toThrow();
  });

  it("zonder Stripe-betaling of zonder betaling: een duidelijke fout", () => {
    expect(() => bouwBetalingBoeking(factuur({ status: "PAID", paidAt: new Date() }), ctx, "2026-04-20")).toThrow(/betaalweg/);
    expect(() => bouwBetalingBoeking(factuur(), ctx, "2026-04-20")).toThrow(/niet betaald/);
  });

  it("de omschrijving bevat nooit een klantnaam, ook niet met rare factuurnummers", () => {
    expect(() => bouwFactuurBoeking(factuur({ number: "Jansen BV" }), ctx, "2026-04-10")).toThrow();
  });
});

describe("boekOpenFacturen", () => {
  it("boekt factuur en betaling, en een tweede run schrijft niets nieuws", async () => {
    m.facturen = [
      factuur({ id: "a", number: "ZF-PF-2026-000001" }),
      factuur({ id: "b", number: "ZF-PF-2026-000002", status: "PAID", paidAt: new Date("2026-04-20T12:00:00+02:00"), stripePaymentIntentId: "pi_2" }),
    ];
    const een = await boekOpenFacturen("adm1");
    expect(een).toMatchObject({ verwerkt: 2, nieuweFacturen: 2, nieuweBetalingen: 1, alGeboekt: 0, fouten: [] });
    const twee = await boekOpenFacturen("adm1");
    expect(twee).toMatchObject({ verwerkt: 2, nieuweFacturen: 0, nieuweBetalingen: 0, alGeboekt: 2, fouten: [] });
    expect(m.geboekt).toHaveLength(3);
  });

  it("een fout bij een factuur stopt de run niet", async () => {
    m.facturen = [factuur({ id: "a" }), factuur({ id: "b", number: "ZF-PF-2026-000002" })];
    m.faalOp = "a";
    const r = await boekOpenFacturen("adm1");
    expect(r.nieuweFacturen).toBe(1);
    expect(r.fouten).toEqual([{ invoiceId: "a", nummer: "ZF-PF-2026-000001", fout: "De periode is vergrendeld." }]);
  });

  it("een geannuleerde factuur die al geboekt was krijgt een tegenboeking, een keer", async () => {
    m.boekingen.set("FACTUUR|c", "boeking-c");
    m.facturen = [factuur({ id: "c", status: "CANCELLED" }), factuur({ id: "nooit", status: "CANCELLED" })];
    const een = await boekOpenFacturen("adm1");
    expect(een).toMatchObject({ nieuweTegenboekingen: 1, overgeslagen: 1 });
    const twee = await boekOpenFacturen("adm1");
    expect(twee).toMatchObject({ nieuweTegenboekingen: 0, alGeboekt: 1 });
  });

  it("een Stripe-loze betaling geeft een melding maar de verkoop staat wel", async () => {
    m.facturen = [factuur({ id: "d", status: "PAID", paidAt: new Date("2026-04-20T12:00:00+02:00") })];
    const r = await boekOpenFacturen("adm1");
    expect(r.nieuweFacturen).toBe(1);
    expect(r.fouten[0]?.fout).toMatch(/betaalweg/);
  });
});
