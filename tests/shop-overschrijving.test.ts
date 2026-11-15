import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// Webshop: betalen per bankoverschrijving zolang Stripe dicht is (15 nov 2026, lib/shop/overschrijving.ts).

vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));

const createCheckoutSession = vi.fn();
vi.mock("@/lib/billing/stripe", () => ({
  createShopOrderCheckoutSession: (...a: unknown[]) => createCheckoutSession(...a),
  transferToConnectedAccount: async () => undefined,
}));
const eisBetalenAan = vi.fn();
vi.mock("@/lib/billing/stripe-betalen", () => ({ eisBetalenAan: (...a: unknown[]) => eisBetalenAan(...a) }));

// een geldig testadres (checksum klopt): geen echte rekening
const IBAN = "NL91ABNA0417164300";
const bank = { iban: IBAN as string | null, naam: "Zekerflex, Inc." as string | null };
const betaalwijze = vi.fn();
vi.mock("@/lib/shop/overschrijving-server", () => ({ huidigeShopBetaalwijze: () => betaalwijze() }));
vi.mock("@/lib/billing/overschrijving-bron", () => ({ platformBankgegevens: () => bank, stripeBetalenDicht: async () => true }));

const sendMail = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/mail", () => ({
  sendMail: (...a: unknown[]) => sendMail(...a),
  mailShell: (title: string, body: string) => `<html>${title}${body}</html>`,
  mailButton: (href: string, label: string) => `<a href="${href}">${label}</a>`,
  isReservedTestAddress: (a: string) => /\.test$/i.test(a.trim()),
}));
const meldVerkopersBetaald = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/shop/verkoper", () => ({ legVerkopersVast: vi.fn(), meldVerkopersBetaald: (...a: unknown[]) => meldVerkopersBetaald(...a) }));

const variantFindMany = vi.fn();
const variantUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
const orderCreate = vi.fn();
const orderUpdate = vi.fn();
const orderUpdateMany = vi.fn();
const orderFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    shopProductVariant: { findMany: (...a: unknown[]) => variantFindMany(...a), updateMany: (...a: unknown[]) => variantUpdateMany(...a) },
    shopOrder: {
      create: (...a: unknown[]) => orderCreate(...a),
      update: (...a: unknown[]) => orderUpdate(...a),
      updateMany: (...a: unknown[]) => orderUpdateMany(...a),
      findUnique: (...a: unknown[]) => orderFindUnique(...a),
    },
  },
}));
const requirePrincipal = vi.fn().mockResolvedValue({ userId: "admin1", email: "admin@zekerflex.test" });
vi.mock("@/lib/auth", () => ({
  getPrincipal: vi.fn().mockResolvedValue(null),
  requirePrincipal: (...a: unknown[]) => requirePrincipal(...a),
  requireRole: vi.fn(),
}));

import { POST } from "@/app/api/shop/orders/route";
import { PATCH } from "@/app/api/shop/orders/[id]/route";
import { rekeningBruikbaar, shopBetaalwijze, shopOverschrijvingVoor } from "@/lib/shop/overschrijving";
import { SHOP_BETAALTERMIJN_DAGEN, shopKenmerk, wachtOpOverschrijving } from "@/lib/shop/overschrijving-kenmerk";

const lees = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8").split("\r\n").join("\n");
const ORDER_ID = "cmh7x2k9q0000abcd1234wxyz";
const VARIANT = { id: "var_1", size: "M", color: "Zwart", priceCents: null, stock: 3, product: { id: "prod_1", name: "Fleece vest", priceCents: 3995, imageUrl: "/shop/fleece.jpg" } };
const KLANT = { firstName: "Sanne", lastName: "Test", email: "sanne@klant.test", address: "Teststraat 1", postalCode: "9711AA", city: "Groningen" };
const ORDER = {
  id: ORDER_ID,
  status: "PENDING_PAYMENT",
  stripeSessionId: null,
  ...KLANT,
  itemsJson: [{ variantId: "var_1", productId: "prod_1", name: "Fleece vest — Maat M, Zwart", priceCents: 3995, qty: 1, imageUrl: "/shop/fleece.jpg", size: "M", color: "Zwart" }],
  subtotalCents: 3995,
  shippingCents: 495,
  totalCents: 4490,
  companyName: null,
  vatNumber: null,
  reference: null,
};

const postReq = (body: unknown) => new Request("http://localhost/api/shop/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const patchReq = (body: unknown) => new Request(`http://localhost/api/shop/orders/${ORDER_ID}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

afterEach(() => {
  vi.clearAllMocks();
  bank.iban = IBAN;
  bank.naam = "Zekerflex, Inc.";
});

describe("de regels", () => {
  it("een kort kenmerk uit het bestelnummer, om over te typen", () => {
    expect(shopKenmerk(ORDER_ID)).toBe("ZF-1234WXYZ");
    expect(shopKenmerk(ORDER_ID)).toHaveLength(11);
  });

  it("per overschrijving alleen als Stripe dicht is én de rekening klopt; anders online of dicht", () => {
    expect(shopBetaalwijze(false, true)).toBe("online");
    expect(shopBetaalwijze(false, false)).toBe("online");
    expect(shopBetaalwijze(true, true)).toBe("overschrijving");
    expect(shopBetaalwijze(true, false)).toBe("dicht");
  });

  it("een rekening wordt nooit verzonnen: geen, een ongeldig IBAN of geen naam is nee", () => {
    expect(rekeningBruikbaar({ iban: IBAN, naam: "Zekerflex, Inc." })).toBe(true);
    expect(rekeningBruikbaar({ iban: "nl91 abna 0417 1643 00", naam: "Zekerflex, Inc." })).toBe(true);
    expect(rekeningBruikbaar({ iban: null, naam: "Zekerflex, Inc." })).toBe(false);
    expect(rekeningBruikbaar({ iban: "NL91ABNA0417164301", naam: "Zekerflex, Inc." })).toBe(false);
    expect(rekeningBruikbaar({ iban: IBAN, naam: "  " })).toBe(false);
  });

  it("alleen een bestelling die op betaling wacht zonder Stripe-sessie wacht op een overschrijving", () => {
    expect(wachtOpOverschrijving({ status: "PENDING_PAYMENT", stripeSessionId: null })).toBe(true);
    expect(wachtOpOverschrijving({ status: "PENDING_PAYMENT", stripeSessionId: "cs_1" })).toBe(false);
    expect(wachtOpOverschrijving({ status: "RECEIVED", stripeSessionId: null })).toBe(false);
    expect(wachtOpOverschrijving({ status: "PAYMENT_FAILED", stripeSessionId: null })).toBe(false);
  });

  it("de gegevens om over te maken: IBAN in groepen, bedrag, kenmerk en termijn", () => {
    const o = shopOverschrijvingVoor({ iban: IBAN, naam: "Zekerflex, Inc.", orderId: ORDER_ID, totaalCents: 4490, status: "PENDING_PAYMENT", stripeSessionId: null });
    expect(o).toEqual({ naam: "Zekerflex, Inc.", ibanLeesbaar: "NL91 ABNA 0417 1643 00", kenmerk: "ZF-1234WXYZ", bedragCents: 4490, termijnDagen: SHOP_BETAALTERMIJN_DAGEN });
    expect(shopOverschrijvingVoor({ iban: IBAN, naam: "Zekerflex, Inc.", orderId: ORDER_ID, totaalCents: 4490, status: "PENDING_PAYMENT", stripeSessionId: "cs_1" })).toBeNull();
    expect(shopOverschrijvingVoor({ iban: null, naam: "Zekerflex, Inc.", orderId: ORDER_ID, totaalCents: 4490, status: "PENDING_PAYMENT", stripeSessionId: null })).toBeNull();
    expect(shopOverschrijvingVoor({ iban: IBAN, naam: "Zekerflex, Inc.", orderId: ORDER_ID, totaalCents: 0, status: "PENDING_PAYMENT", stripeSessionId: null })).toBeNull();
  });
});

describe("bestellen per overschrijving (POST /api/shop/orders)", () => {
  it("Stripe dicht en de rekening ingevuld: de bestelling gaat door zonder Stripe, met de gegevens in de mail", async () => {
    betaalwijze.mockResolvedValue("overschrijving");
    variantFindMany.mockResolvedValue([VARIANT]);
    orderCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...ORDER, ...data, id: ORDER_ID }));

    const res = await POST(postReq({ ...KLANT, items: [{ variantId: "var_1", qty: 1 }] }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({ ok: true, id: ORDER_ID, overschrijving: true });
    expect(json.checkoutUrl).toMatch(new RegExp(`/shop/bestelling/${ORDER_ID}\\?t=`));
    expect(eisBetalenAan).not.toHaveBeenCalled();
    expect(createCheckoutSession).not.toHaveBeenCalled();
    expect(orderUpdate).not.toHaveBeenCalled(); // geen Stripe-sessie: zo herkent de rest hem als overschrijving
    // de klant krijgt rekening, bedrag en kenmerk; het interne seintje blijft weg bij een testadres (AGENTS.md)
    expect(sendMail).toHaveBeenCalledTimes(1);
    const mail = sendMail.mock.calls[0]?.[0] as { to: string; subject: string; text: string };
    expect(mail.to).toBe("sanne@klant.test");
    expect(mail.subject).toContain("€ 44,90");
    expect(mail.text).toContain("NL91 ABNA 0417 1643 00");
    expect(mail.text).toContain("ZF-1234WXYZ");
    expect(mail.text).toContain("Zekerflex, Inc.");
  });

  it("een echte klant: de shop krijgt ook een seintje dat er een overschrijving aankomt", async () => {
    betaalwijze.mockResolvedValue("overschrijving");
    variantFindMany.mockResolvedValue([VARIANT]);
    orderCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...ORDER, ...data, id: ORDER_ID }));

    await POST(postReq({ ...KLANT, email: "sanne@voorbeeld.nl", items: [{ variantId: "var_1", qty: 1 }] }));
    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(String((sendMail.mock.calls[1]?.[0] as { subject: string }).subject)).toContain("wacht op overschrijving");
  });

  it("Stripe open: precies als altijd, eerst de controle en dan het Stripe-betaalscherm", async () => {
    betaalwijze.mockResolvedValue("online");
    variantFindMany.mockResolvedValue([VARIANT]);
    orderCreate.mockResolvedValue({ ...ORDER });
    orderUpdate.mockResolvedValue({});
    createCheckoutSession.mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe.com/cs_1" });

    const json = await (await POST(postReq({ ...KLANT, items: [{ variantId: "var_1", qty: 1 }] }))).json();
    expect(eisBetalenAan).toHaveBeenCalledTimes(1);
    expect(json.checkoutUrl).toBe("https://checkout.stripe.com/cs_1");
    expect(json.overschrijving).toBeUndefined();
  });
});

describe("Overschrijving ontvangen (PATCH status RECEIVED)", () => {
  it("de eerste keer: voorraad eraf, bevestiging naar de klant en de verkopers op de hoogte", async () => {
    orderFindUnique.mockResolvedValue({ status: "PENDING_PAYMENT", stripeSessionId: null });
    orderUpdateMany.mockResolvedValue({ count: 1 });
    orderUpdate.mockResolvedValue({ ...ORDER, status: "RECEIVED" });

    const res = await PATCH(patchReq({ status: "RECEIVED" }), { params: Promise.resolve({ id: ORDER_ID }) });
    expect(res.status).toBe(200);
    expect(orderUpdateMany).toHaveBeenCalledWith({ where: { id: ORDER_ID, status: "PENDING_PAYMENT", stripeSessionId: null }, data: { status: "RECEIVED" } });
    expect(variantUpdateMany).toHaveBeenCalledWith({ where: { id: "var_1", stock: { gte: 1 } }, data: { stock: { decrement: 1 } } });
    expect(sendMail.mock.calls.map((c) => (c[0] as { subject: string }).subject)).toEqual(expect.arrayContaining([expect.stringContaining("Je betaling is gelukt")]));
    expect(meldVerkopersBetaald).toHaveBeenCalledTimes(1);
  });

  it("een dubbele klik (de claim lukt niet meer): niets twee keer", async () => {
    orderFindUnique.mockResolvedValue({ status: "PENDING_PAYMENT", stripeSessionId: null });
    orderUpdateMany.mockResolvedValue({ count: 0 });
    orderUpdate.mockResolvedValue({ ...ORDER, status: "RECEIVED" });

    await PATCH(patchReq({ status: "RECEIVED" }), { params: Promise.resolve({ id: ORDER_ID }) });
    expect(variantUpdateMany).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
    expect(meldVerkopersBetaald).not.toHaveBeenCalled();
  });

  it("een bestelling via Stripe met de hand op betaald: geen voorraad of mails (dat doet de webhook)", async () => {
    orderFindUnique.mockResolvedValue({ status: "PENDING_PAYMENT", stripeSessionId: "cs_1" });
    orderUpdate.mockResolvedValue({ ...ORDER, stripeSessionId: "cs_1", status: "RECEIVED" });

    await PATCH(patchReq({ status: "RECEIVED" }), { params: Promise.resolve({ id: ORDER_ID }) });
    expect(orderUpdateMany).not.toHaveBeenCalled();
    expect(variantUpdateMany).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });
});

describe("de schermen", () => {
  it("de browser krijgt alleen het pure deel, nooit het bestand met het IBAN-controlecijfer (sepa → stripe, env)", () => {
    for (const f of ["components/marketing/OrderTracking.tsx", "components/marketing/ShopChrome.tsx", "components/admin/ShopAdmin.tsx"]) {
      const s = lees(f);
      expect(s.startsWith('"use client"'), f).toBe(true);
      expect(s, f).not.toMatch(/from "@\/lib\/shop\/overschrijving(-server)?"/);
    }
  });

  it("de bestelpagina toont rekening, bedrag en kenmerk met een kopieerknop; de shop belooft alleen wat echt kan", () => {
    const t = lees("components/marketing/OrderTracking.tsx");
    expect(t).toContain("<Overmaken o={overschrijving} />");
    expect(t).toContain('aria-live="polite"');
    const c = lees("components/marketing/ShopChrome.tsx");
    expect(c).toContain('betaalwijze === "online" ? ["iDEAL"');
    expect(c).toContain('disabled={placing || items.length === 0 || betaalwijze === "dicht"}');
    expect(lees("app/shop/layout.tsx")).toContain("huidigeShopBetaalwijze()");
  });

  it("terugbetalen via Stripe alleen bij een betaling via Stripe; de knop Overschrijving ontvangen bij een overschrijving", () => {
    const a = lees("components/admin/ShopAdmin.tsx");
    expect(a).toContain('["RECEIVED", "CONFIRMED", "SHIPPED"].includes(order.status) && order.stripePaymentIntentId');
    expect(a).toContain("Overschrijving ontvangen");
  });
});
