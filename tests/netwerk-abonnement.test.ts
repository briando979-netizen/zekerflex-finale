import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

// Een pakket aanzetten, betalen en opzeggen (lib/netwerk/abonnement.ts):
// 5G is altijd een aanvraag met een lead; wifi en VPN gaan op de lijst zolang
// de server erachter niet draait, zijn gratis voor een kosteloos account en
// lopen anders via een Stripe-abonnement dat de webhook activeert.

process.env.AUTH_SECRET ??= "test-geheim-voor-de-wifi-wachtwoorden-0123456789";

const store = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => structuredClone(store.get(k) ?? null),
  kvSet: async (k: string, v: unknown) => void store.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void store.delete(k),
  kvListEntries: async (prefix: string) => [...store.entries()].filter(([k]) => k.startsWith(prefix)).map(([key, value]) => ({ key, value: structuredClone(value) })),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenant: { findUnique: async () => ({ id: "t1", name: "Bakkerij Jansen", stripeCustomerId: "cus_1" }), update: async () => ({}) },
    branch: { findMany: async () => [] },
  },
}));
let kosteloos = false;
vi.mock("@/lib/billing/comp", () => ({ isCompTenant: async () => kosteloos }));
const checkout = vi.fn(async (_input: unknown) => ({ id: "cs_1", url: "https://stripe.test/cs_1" }));
const opzeggen = vi.fn(async (_id: string, _patch: unknown) => ({ items: { data: [{ current_period_end: 1_800_000_000 }] } }));
vi.mock("@/lib/billing/stripe", () => ({
  createNetwerkCheckoutSession: (input: unknown) => checkout(input),
  ensureStripeCustomer: async () => "cus_1",
  getStripeClient: () => ({ subscriptions: { update: (id: string, patch: unknown) => opzeggen(id, patch) } }),
}));
const lead = vi.fn(async (_input: unknown) => ({ id: "lead1" }));
vi.mock("@/lib/sales/leads", () => ({ createLead: (input: unknown) => lead(input) }));
vi.mock("@/lib/audit", () => ({ recordAudit: async () => undefined }));
let wifiKlaar = false;
let vpnKlaar = false;
vi.mock("@/lib/netwerk/token", () => ({ wifiServerKlaar: () => wifiKlaar, checkNetwerkToken: () => ({ ok: true }) }));
vi.mock("@/lib/netwerk/headscale", () => ({ vpnGekoppeld: () => vpnKlaar, vpnAdres: () => null }));

import type { Principal } from "@/lib/auth";
import { activeerNetwerkModule, moduleLeverbaar, netwerkAbonnementBeeindigd, startModule, zegModuleOp } from "@/lib/netwerk/abonnement";
import { netwerkStand, standMetAbonnement } from "@/lib/netwerk/store";

const baas: Principal = { userId: "u1", email: "baas@bedrijf.test", fullName: "Bas de Baas", emailVerifiedAt: null, grants: [], memberships: [], managedBranchIds: [] };

beforeEach(() => {
  store.clear();
  kosteloos = false;
  wifiKlaar = false;
  vpnKlaar = false;
  checkout.mockClear();
  opzeggen.mockClear();
  lead.mockClear();
});

describe("aanzetten", () => {
  it("5G: altijd een aanvraag, met een lead in de pijplijn", async () => {
    const r = await startModule("t1", { sleutel: "5g", aantal: 1, toelichting: "Bouwplaats Zwolle, 40 scanners" }, baas);
    expect(r.checkoutUrl).toBeUndefined();
    expect(r.stand.modules["5g"]).toMatchObject({ status: "aangevraagd", aantal: 1, toelichting: "Bouwplaats Zwolle, 40 scanners" });
    expect(r.melding).toMatch(/contact/);
    expect(lead).toHaveBeenCalledWith(expect.objectContaining({ companyName: "Bakkerij Jansen", source: "netwerk-5g", contactEmail: "baas@bedrijf.test", createdById: "u1" }));
    expect(checkout).not.toHaveBeenCalled();
  });

  it("wifi zonder draaiende server: op de lijst, niets betalen", async () => {
    expect(moduleLeverbaar("wifi")).toBe(false);
    const r = await startModule("t1", { sleutel: "wifi", aantal: 2 }, baas);
    expect(r.stand.modules.wifi).toMatchObject({ status: "aangevraagd", aantal: 2 });
    expect(r.melding).toMatch(/op de lijst/);
    expect(checkout).not.toHaveBeenCalled();
  });

  it("kosteloos account: meteen actief voor € 0", async () => {
    wifiKlaar = true;
    kosteloos = true;
    const r = await startModule("t1", { sleutel: "wifi", aantal: 2 }, baas);
    expect(r.stand.modules.wifi).toMatchObject({ status: "actief", gratis: true, aantal: 2 });
    expect(r.melding).toMatch(/Gratis/);
    expect(checkout).not.toHaveBeenCalled();
    await expect(startModule("t1", { sleutel: "wifi", aantal: 2 }, baas)).rejects.toThrow(/staat al aan/);
  });

  it("betalen via Stripe: € 49 per vestiging, en de webhook zet het op actief (ook bij een dubbele melding)", async () => {
    wifiKlaar = true;
    const r = await startModule("t1", { sleutel: "wifi", aantal: 3 }, baas);
    expect(r.checkoutUrl).toBe("https://stripe.test/cs_1");
    expect(r.stand.modules.wifi).toMatchObject({ status: "wacht-op-betaling", stripeSessionId: "cs_1", aantal: 3 });
    expect(checkout).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "t1", module: "wifi", aantal: 3, unitAmountCents: 4900, stripeCustomerId: "cus_1" }));
    expect((checkout.mock.calls[0]?.[0] as { successUrl: string }).successUrl).toContain("/werkgever/netwerk?pakket=wifi&betaald=1");

    const sessie = { metadata: { netwerkTenantId: "t1", netwerkModule: "wifi", netwerkAantal: "3" }, subscription: "sub_1" } as unknown as Stripe.Checkout.Session;
    await activeerNetwerkModule(sessie);
    const na = (await netwerkStand("t1")).modules.wifi;
    expect(na).toMatchObject({ status: "actief", aantal: 3, stripeSubId: "sub_1" });
    const sinds = na?.sinds;
    await activeerNetwerkModule(sessie);
    expect((await netwerkStand("t1")).modules.wifi?.sinds).toBe(sinds);
    expect(await standMetAbonnement("sub_1")).toMatchObject({ tenantId: "t1", sleutel: "wifi" });
    expect(await standMetAbonnement("sub_x")).toBeNull();
  });

  it("VPN: per gebruiker of onbeperkt (dan één regel van € 149); zonder keuze een nette fout", async () => {
    vpnKlaar = true;
    await startModule("t1", { sleutel: "vpn", aantal: 25, variant: "per-gebruiker" }, baas);
    expect(checkout).toHaveBeenLastCalledWith(expect.objectContaining({ module: "vpn", aantal: 25, unitAmountCents: 400, variant: "per-gebruiker" }));
    await startModule("t1", { sleutel: "vpn", aantal: 80, variant: "onbeperkt" }, baas);
    expect(checkout).toHaveBeenLastCalledWith(expect.objectContaining({ module: "vpn", aantal: 1, unitAmountCents: 14900, variant: "onbeperkt" }));
    await expect(startModule("t1", { sleutel: "vpn", aantal: 3 }, baas)).rejects.toThrow(/per gebruiker of onbeperkt/);
    await expect(startModule("t1", { sleutel: "wifi", aantal: 0 }, baas)).rejects.toThrow(/1 tot 500/);
  });
});

describe("opzeggen", () => {
  it("met een Stripe-abonnement loopt het door tot het einde van de periode; Stripe meldt daarna het einde", async () => {
    wifiKlaar = true;
    await startModule("t1", { sleutel: "wifi", aantal: 1 }, baas);
    await activeerNetwerkModule({ metadata: { netwerkTenantId: "t1", netwerkModule: "wifi", netwerkAantal: "1" }, subscription: "sub_1" } as unknown as Stripe.Checkout.Session);
    const r = await zegModuleOp("t1", "wifi", baas);
    expect(opzeggen).toHaveBeenCalledWith("sub_1", { cancel_at_period_end: true });
    expect(r.stand.modules.wifi).toMatchObject({ status: "actief", eindigtOp: new Date(1_800_000_000 * 1000).toISOString() });
    expect(r.melding).toMatch(/einde van de betaalde periode/);
    await netwerkAbonnementBeeindigd("sub_1");
    expect((await netwerkStand("t1")).modules.wifi?.status).toBe("opgezegd");
    await netwerkAbonnementBeeindigd("sub_1"); // nog een keer: geen fout
  });

  it("gratis of aangevraagd: stopt meteen; wat niet aanstaat kan niet opgezegd worden", async () => {
    await startModule("t1", { sleutel: "wifi", aantal: 1 }, baas); // op de lijst
    const r = await zegModuleOp("t1", "wifi", baas);
    expect(r.stand.modules.wifi?.status).toBe("opgezegd");
    expect(opzeggen).not.toHaveBeenCalled();
    await expect(zegModuleOp("t1", "wifi", baas)).rejects.toThrow(/niet aan/);
    await expect(zegModuleOp("t1", "vpn", baas)).rejects.toThrow(/niet aan/);
  });
});
