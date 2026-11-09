import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

// Bij een nieuw Stripe-account van een rijschool of horecazaak vullen we alleen
// de KvK-gegevens vooraf in: de statutaire naam (niet de naam van de zaak), het
// KvK-nummer als tax_id en een compleet adres. Ontbreekt iets, dan laten we het
// weg en vraagt Stripe het zelf.

const db = vi.hoisted(() => ({ reg: null as unknown, fout: false }));
vi.mock("@/lib/logger", () => ({ logger: { warn: () => undefined, info: () => undefined, error: () => undefined } }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenant: {
      findUnique: async () => {
        if (db.fout) throw new Error("database weg");
        return { companyRegistration: db.reg };
      },
    },
  },
}));

import { isBedrijfsveldFout, maakAccountMetKvk, stripeBedrijf, stripeBedrijfVan } from "@/lib/billing/stripe-bedrijf";

const reg = {
  legalName: "Rijschool Veilig B.V.",
  kvkNumber: "12345678",
  street: "Stationsweg",
  houseNumber: "12",
  postalCode: "3511 AB",
  city: "Utrecht",
};

describe("stripeBedrijf", () => {
  it("geeft de statutaire naam, het KvK-nummer en het adres uit de KvK", () => {
    expect(stripeBedrijf(reg)).toEqual({
      name: "Rijschool Veilig B.V.",
      tax_id: "12345678",
      address: { line1: "Stationsweg 12", postal_code: "3511 AB", city: "Utrecht", country: "NL" },
    });
  });

  it("laat een onvolledig adres en een ongeldig KvK-nummer weg", () => {
    expect(stripeBedrijf({ ...reg, city: null, kvkNumber: "1234" })).toEqual({ name: "Rijschool Veilig B.V." });
    expect(stripeBedrijf({ ...reg, street: null, houseNumber: null })).toEqual({ name: "Rijschool Veilig B.V.", tax_id: "12345678" });
  });

  it("vult niets in zonder registratie of zonder bruikbare gegevens", () => {
    expect(stripeBedrijf(null)).toBeUndefined();
    expect(stripeBedrijf(undefined)).toBeUndefined();
    expect(stripeBedrijf({ legalName: " ", kvkNumber: "", street: null, houseNumber: null, postalCode: null, city: null })).toBeUndefined();
  });

  it("zet geen lege of null-velden in de aanvraag (Stripe weigert die)", () => {
    const c = stripeBedrijf({ ...reg, postalCode: null });
    expect(c).not.toHaveProperty("address");
    expect(Object.values(c ?? {}).every((v) => v !== null && v !== undefined && v !== "")).toBe(true);
  });
});

describe("stripeBedrijfVan", () => {
  it("leest de registratie van het bedrijf", async () => {
    db.fout = false;
    db.reg = reg;
    expect((await stripeBedrijfVan("t1"))?.tax_id).toBe("12345678");
  });

  it("houdt het koppelen niet tegen als de database niet antwoordt", async () => {
    db.fout = true;
    expect(await stripeBedrijfVan("t1")).toBeUndefined();
  });
});

describe("maakAccountMetKvk", () => {
  const gegevens: Stripe.AccountCreateParams = { type: "express", country: "NL", metadata: { rijschoolId: "r1" } };
  const nepStripe = (create: (p: Stripe.AccountCreateParams) => Promise<unknown>) =>
    ({ accounts: { create: vi.fn(create) } }) as unknown as Pick<Stripe, "accounts"> & { accounts: { create: ReturnType<typeof vi.fn> } };

  it("maakt het account met de KvK-gegevens erin", async () => {
    db.fout = false;
    db.reg = reg;
    const s = nepStripe(async () => ({ id: "acct_1" }));
    expect((await maakAccountMetKvk(s, gegevens, "t1")).id).toBe("acct_1");
    expect(s.accounts.create).toHaveBeenCalledTimes(1);
    expect(s.accounts.create.mock.calls[0]?.[0]).toEqual({ ...gegevens, company: stripeBedrijf(reg) });
  });

  it("zonder registratie: precies de gewone aanvraag", async () => {
    db.fout = false;
    db.reg = null;
    const s = nepStripe(async () => ({ id: "acct_2" }));
    await maakAccountMetKvk(s, gegevens, "t1");
    expect(s.accounts.create.mock.calls[0]?.[0]).toEqual(gegevens);
  });

  it("weigert Stripe een bedrijfsveld, dan opnieuw zonder", async () => {
    db.fout = false;
    db.reg = reg;
    const s = nepStripe(async (p) => {
      if (p.company) throw Object.assign(new Error("Invalid tax_id"), { type: "StripeInvalidRequestError", param: "company[tax_id]" });
      return { id: "acct_3" };
    });
    expect((await maakAccountMetKvk(s, gegevens, "t1")).id).toBe("acct_3");
    expect(s.accounts.create).toHaveBeenCalledTimes(2);
    expect(s.accounts.create.mock.calls[1]?.[0]).toEqual(gegevens);
  });

  it("een andere fout gaat gewoon door (geen tweede account)", async () => {
    db.fout = false;
    db.reg = reg;
    const s = nepStripe(async () => {
      throw Object.assign(new Error("You must complete your platform profile to use Connect"), { type: "StripeInvalidRequestError" });
    });
    await expect(maakAccountMetKvk(s, gegevens, "t1")).rejects.toThrow(/platform profile/);
    expect(s.accounts.create).toHaveBeenCalledTimes(1);
    expect(isBedrijfsveldFout(new Error("x"))).toBe(false);
  });
});
