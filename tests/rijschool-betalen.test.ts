import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

// Een kleine nep-database met alleen wat verwerkRijschoolSessie gebruikt.
const db = vi.hoisted(() => ({
  betalingen: [] as { id: string; leerlingId: string; productId: string | null; omschrijving: string; bedragCent: number; status: string; stripeSessionId: string | null; methode?: string }[],
  tegoed: [] as { leerlingId: string; betalingId: string; minuten: number }[],
  mails: [] as string[],
}));

vi.mock("@/lib/prisma", () => {
  const product = { id: "p1", rijschoolId: "r1", naam: "10 lessen", lessen: 10, lesMinuten: 60, prijsCent: 62500 };
  const tx = {
    rijschoolProduct: {
      findFirst: async ({ where }: { where: { id: string } }) => (where.id === "p1" ? product : null),
      findUnique: async ({ where }: { where: { id: string } }) => (where.id === "p1" ? product : null),
    },
    rijschoolBetaling: {
      findFirst: async ({ where }: { where: { id: string } }) => db.betalingen.find((b) => b.id === where.id) ?? null,
      create: async ({ data }: { data: (typeof db.betalingen)[number] }) => {
        if (db.betalingen.some((b) => b.stripeSessionId && b.stripeSessionId === data.stripeSessionId)) {
          throw new Prisma.PrismaClientKnownRequestError("dubbel", { code: "P2002", clientVersion: "5" });
        }
        const b = { ...data, id: `b${db.betalingen.length + 1}` };
        db.betalingen.push(b);
        return b;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<(typeof db.betalingen)[number]> }) => Object.assign(db.betalingen.find((b) => b.id === where.id)!, data),
    },
    rijschoolTegoed: {
      create: async ({ data }: { data: (typeof db.tegoed)[number] }) => {
        if (db.tegoed.some((t) => t.betalingId === data.betalingId)) throw new Prisma.PrismaClientKnownRequestError("dubbel", { code: "P2002", clientVersion: "5" });
        db.tegoed.push(data);
        return data;
      },
    },
  };
  return {
    prisma: {
      ...tx,
      rijschool: { findUnique: async () => ({ id: "r1", naam: "Rijschool Proef", slug: "proef", kleur: "#123456", email: "", telefoon: "" }) },
      rijschoolLeerling: { findFirst: async () => ({ id: "l1", naam: "Lisa Proef", email: "lisa@example.com" }) },
      $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    },
  };
});
vi.mock("@/lib/rijschool/mail", () => ({
  siteUrl: () => "https://zekerflex.com/rijschool/proef",
  betalingOntvangenMail: (_r: unknown, _l: unknown, b: { omschrijving: string }) => ({ subject: b.omschrijving }),
  verstuur: async (m: { subject: string }) => (db.mails.push(m.subject), true),
}));
vi.mock("@/lib/billing/stripe", () => ({ getStripeClient: () => ({}) }));

import type Stripe from "stripe";
import { verwerkRijschoolSessie } from "@/lib/rijschool/betalen";

const sessie = (id: string, metadata: Record<string, string>, betaald = true) =>
  ({ id, metadata, payment_status: betaald ? "paid" : "unpaid", amount_total: 62500 }) as unknown as Stripe.Checkout.Session;

describe("iDEAL-betaling van een rijschool verwerken", () => {
  beforeEach(() => {
    db.betalingen.length = 0;
    db.tegoed.length = 0;
    db.mails.length = 0;
  });

  it("een gekocht pakket wordt een betaling met tegoed, één keer", async () => {
    const s = sessie("cs_1", { rijschoolId: "r1", leerlingId: "l1", productId: "p1" });
    expect(await verwerkRijschoolSessie(s)).toBe(true);
    expect(await verwerkRijschoolSessie(s)).toBe(true); // Stripe stuurt hem nog een keer
    expect(db.betalingen).toHaveLength(1);
    expect(db.betalingen[0]).toMatchObject({ status: "BETAALD", methode: "IDEAL", bedragCent: 62500, stripeSessionId: "cs_1" });
    expect(db.tegoed).toEqual([{ leerlingId: "l1", betalingId: "b1", minuten: 600, omschrijving: "10 lessen", door: "iDEAL" }]);
    expect(db.mails).toEqual(["10 lessen"]);
  });

  it("een openstaande betaling wordt betaald, niet opnieuw aangemaakt", async () => {
    db.betalingen.push({ id: "open1", leerlingId: "l1", productId: "p1", omschrijving: "10 lessen", bedragCent: 62500, status: "OPEN", stripeSessionId: null });
    const s = sessie("cs_2", { rijschoolId: "r1", leerlingId: "l1", rijschoolBetalingId: "open1" });
    await verwerkRijschoolSessie(s);
    await verwerkRijschoolSessie(s);
    expect(db.betalingen).toHaveLength(1);
    expect(db.betalingen[0]).toMatchObject({ status: "BETAALD", methode: "IDEAL" });
    expect(db.tegoed).toHaveLength(1);
    expect(db.mails).toHaveLength(1);
  });

  it("nog niet betaald (iDEAL bevestigt later): niets boeken", async () => {
    expect(await verwerkRijschoolSessie(sessie("cs_3", { rijschoolId: "r1", leerlingId: "l1", productId: "p1" }, false))).toBe(true);
    expect(db.betalingen).toHaveLength(0);
  });

  it("geen rijschoolbetaling: niet herkend", async () => {
    expect(await verwerkRijschoolSessie(sessie("cs_4", { invoiceId: "x" }))).toBe(false);
  });
});

describe("testadressen maken nooit een live Stripe-account", () => {
  it("herkent gereserveerde testadressen", async () => {
    const { isTestAdres } = await import("@/lib/rijschool/betalen");
    for (const a of ["pay-e2e-1@example.com", "x@example.net", "x@school.test", "x@a.example", "x@a.invalid", "x@localhost.localhost"]) expect(isTestAdres(a)).toBe(true);
    for (const a of ["info@rijschooljansen.nl", "testbedrijven@gmail.com", "x@example-rijschool.nl", "x@mijnexample.com"]) expect(isTestAdres(a)).toBe(false);
  });
});
