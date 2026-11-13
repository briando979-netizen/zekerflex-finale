import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// 13 nov 2026, eigenaar: "Je moet zekerflex even vergeten. Bij Stripe. En dan moet je bij Stripe mijn nieuwe account
// dan zekerflex INC zien." Beheer → Stripe-account: sleutel plakken, controleren zonder te wisselen, dan pas gebruiken.

const m = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  account: { id: "acct_inc", charges_enabled: true, payouts_enabled: true, country: "US", business_profile: { name: "Zekerflex, Inc." }, company: { name: "zekerflex, Inc." } } as Record<string, unknown>,
  retrieveFout: null as unknown,
  webhookCreate: vi.fn(),
  sleutels: [] as string[],
}));
vi.mock("stripe", () => ({
  default: class {
    accounts = { retrieveCurrent: async () => { if (m.retrieveFout) throw m.retrieveFout; return m.account; } };
    identity = { verificationSessions: { list: async () => ({ data: [] }) } };
    webhookEndpoints = { create: m.webhookCreate };
    constructor(sleutel: string) {
      m.sleutels.push(sleutel);
    }
  },
}));
vi.mock("@/lib/env", () => ({ env: { AUTH_SECRET: "x".repeat(40) } }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (m.kv.has(k) ? structuredClone(m.kv.get(k)) : null),
  kvSet: async (k: string, v: unknown) => void m.kv.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void m.kv.delete(k),
}));

import {
  STRIPE_ACTIEF_KV,
  actiefWebhookGeheimUitGeheugen,
  actieveStripeSleutelUitGeheugen,
  controleerStripeSleutel,
  gebruikStripeAccount,
  isOudConnectAccount,
  laadActieveStripeSleutel,
  markeerOudeConnectAccounts,
  terugNaarVorigStripeAccount,
} from "@/lib/billing/stripe-account";
import { STRIPE_WEBHOOK_EVENTS, stripeAccountSleutelFout, waaromNietGebruiken } from "@/lib/billing/stripe-account-vorm";

// in stukken, zodat de geheimscanner er geen echte sleutel in ziet
const LIVE = "sk_" + "live_" + "A1b2C3d4E5f6G7h8I9j0K1l2";
const TEST = "sk_" + "test_" + "A1b2C3d4E5f6G7h8I9j0K1l2";
const WHSEC = "whsec_" + "nieuwgeheim1234567890";
const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");

beforeEach(async () => {
  m.kv.clear();
  m.retrieveFout = null;
  m.account.charges_enabled = true;
  m.webhookCreate.mockReset();
  m.webhookCreate.mockResolvedValue({ id: "we_nieuw", secret: WHSEC });
  await laadActieveStripeSleutel(Date.now(), true);
});

describe("de sleutel", () => {
  it("alleen een geheime sleutel (sk_ of rk_), geen publieke of webhook-sleutel", () => {
    expect(stripeAccountSleutelFout(LIVE)).toBeNull();
    expect(stripeAccountSleutelFout("pk_" + "live_" + "abcdefghijklmnopqrstu")).toMatch(/publieke sleutel/);
    expect(stripeAccountSleutelFout(WHSEC)).toMatch(/webhook-geheim/);
    expect(stripeAccountSleutelFout("hallo")).toMatch(/sk_live_/);
  });

  it("de webhook krijgt alle gebeurtenissen die de route verwerkt, ook die van Identity", () => {
    const route = bron("app/api/webhooks/stripe/route.ts");
    const verwerkt = [...route.matchAll(/event\.type === "([a-z_.]+)"/g)].map((x) => x[1]);
    expect(verwerkt.length).toBeGreaterThan(10);
    for (const t of verwerkt) expect(STRIPE_WEBHOOK_EVENTS as readonly string[]).toContain(t);
    expect(STRIPE_WEBHOOK_EVENTS.some((e) => e.startsWith("identity.verification_session."))).toBe(true);
  });
});

describe("controleren verandert niets", () => {
  it("laat het account zien, bewaart niets en gebruikt de sleutel nog niet", async () => {
    const c = await controleerStripeSleutel(LIVE);
    expect(c).toMatchObject({ accountId: "acct_inc", naam: "Zekerflex, Inc.", juridischeNaam: "zekerflex, Inc.", land: "US", betalen: true, uitbetalen: true, live: true, eind: LIVE.slice(-4) });
    expect(m.kv.size).toBe(0);
    expect(actieveStripeSleutelUitGeheugen()).toBeNull();
  });

  it("een sleutel die Stripe weigert: een rustige melding zonder de tekst van Stripe", async () => {
    m.retrieveFout = Object.assign(new Error("Invalid API Key provided: sk_live_****ABCD"), { type: "StripeAuthenticationError" });
    await expect(controleerStripeSleutel(LIVE)).rejects.toThrow(/kent deze sleutel niet/);
    await expect(controleerStripeSleutel(LIVE)).rejects.not.toThrow(/ABCD/);
  });

  it("niet gebruiken: een testsleutel, of een account zonder betalingen", async () => {
    expect(waaromNietGebruiken(await controleerStripeSleutel(TEST))).toMatch(/testsleutel/);
    m.account.charges_enabled = false;
    await expect(gebruikStripeAccount(LIVE, "Eigenaar", "https://zekerflex.com/api/webhooks/stripe")).rejects.toThrow(/geen betalingen ontvangen/);
    expect(m.kv.size).toBe(0);
  });
});

describe("gebruiken en terug", () => {
  it("bewaart sleutel en webhook-geheim verzegeld, maakt de webhook aan en gebruikt hem meteen", async () => {
    const info = await gebruikStripeAccount(LIVE, "Eigenaar", "https://zekerflex.com/api/webhooks/stripe");
    expect(info).toMatchObject({ accountId: "acct_inc", eind: LIVE.slice(-4), webhook: true, heeftVorige: false });
    expect(m.webhookCreate).toHaveBeenCalledTimes(1);
    expect(m.webhookCreate.mock.calls[0]?.[0]).toMatchObject({ url: "https://zekerflex.com/api/webhooks/stripe", enabled_events: [...STRIPE_WEBHOOK_EVENTS] });
    const opslag = JSON.stringify(m.kv.get(STRIPE_ACTIEF_KV));
    expect(opslag).not.toContain(LIVE);
    expect(opslag).not.toContain(WHSEC);
    expect(actieveStripeSleutelUitGeheugen()).toBe(LIVE);
    expect(actiefWebhookGeheimUitGeheugen()).toBe(WHSEC);
  });

  it("hetzelfde account opnieuw: geen tweede webhook", async () => {
    await gebruikStripeAccount(LIVE, "Eigenaar", "https://zekerflex.com/api/webhooks/stripe");
    await gebruikStripeAccount(LIVE, "Eigenaar", "https://zekerflex.com/api/webhooks/stripe");
    expect(m.webhookCreate).toHaveBeenCalledTimes(1);
  });

  it("terug: zonder vorige keuze weer de sleutel uit .env", async () => {
    await gebruikStripeAccount(LIVE, "Eigenaar", "https://zekerflex.com/api/webhooks/stripe");
    expect(await terugNaarVorigStripeAccount()).toBeNull();
    expect(m.kv.has(STRIPE_ACTIEF_KV)).toBe(false);
    expect(actieveStripeSleutelUitGeheugen()).toBeNull();
  });

  it("Connect-accounts van het vorige platform koppelen opnieuw; bij terug gelden ze weer; niets gewist", async () => {
    // zoals de route: eerst markeren met het platform dat we verlaten (.env), dan wisselen
    expect(await markeerOudeConnectAccounts(["acct_oud1", "acct_oud2", "geen-id"], "env")).toBe(2);
    await gebruikStripeAccount(LIVE, "Eigenaar", "https://zekerflex.com/api/webhooks/stripe");
    expect(await isOudConnectAccount("acct_oud1")).toBe(true);
    expect(await isOudConnectAccount("acct_nieuw")).toBe(false);
    expect(await isOudConnectAccount(null)).toBe(false);
    // een werker koppelde opnieuw bij Inc. (acct_inc1); dan terug naar .env: de oude gelden weer, het nieuwe niet
    await markeerOudeConnectAccounts(["acct_oud1", "acct_inc1"], "acct_inc");
    await terugNaarVorigStripeAccount();
    expect(await isOudConnectAccount("acct_oud1")).toBe(false);
    expect(await isOudConnectAccount("acct_inc1")).toBe(true);
  });
});

describe("de rest van ZekerFlex gebruikt het gekozen account", () => {
  it("getStripeClient en de webhook kiezen eerst Beheer, dan .env; de webhook probeert beide geheimen", () => {
    const s = bron("lib/billing/stripe.ts");
    expect(s).toContain("const sleutel = actieveStripeSleutelUitGeheugen() ?? env.STRIPE_SECRET_KEY;");
    expect(s).toContain("[actiefWebhookGeheimUitGeheugen(), env.STRIPE_WEBHOOK_SECRET]");
    expect(bron("app/api/webhooks/stripe/route.ts")).toContain("await laadActieveStripeSleutel().catch(() => undefined);");
    expect(bron("lib/billing/stripe-betalen.ts")).toContain("await laadActieveStripeSleutel(nu).catch(() => undefined);");
    expect(bron("instrumentation.ts")).toContain("laadActieveStripeSleutel(Date.now(), true)");
    // vlak na een herstart: niet stil het oude account, maar even weigeren en laden (alleen op de echte server)
    expect(s).toContain('if (!stripeKeuzeGeladen() && process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {');
    expect(bron("lib/billing/stripe-betalen.ts")).toContain("await laadActieveStripeSleutel(nu.getTime()).catch(() => undefined);");
  });

  it("de beheerroute is strikt PLATFORM_ADMIN, en de sleutel komt nooit in de audit", () => {
    const r = bron("app/api/admin/stripe-account/route.ts");
    expect(r.match(/withAdminAccess\(\["PLATFORM_ADMIN"\]/g)?.length).toBe(3);
    expect(r).not.toMatch(/summary: `[^`]*\$\{sleutel/);
    expect(bron("lib/admin/nav.ts")).toContain('{ href: "/admin/stripe-account", label: "Stripe-account" }');
  });

  it("na een wissel of terug: geen overboeking naar een Connect-account van een ander platform-account", () => {
    const r = bron("app/api/admin/stripe-account/route.ts");
    // uitbetalingen kijken alleen naar stripePayoutsEnabled; die gaat uit voor oude koppelingen, bij gebruik én terug
    expect(r).toContain("data: { stripePayoutsEnabled: false }");
    expect(r.match(/await zetOudeUitbetalingUit\(\);|= await zetOudeUitbetalingUit\(\);/g)?.length).toBe(2);
    // een nieuwe koppeling begint zonder uitbetalen
    expect(bron("app/api/me/payout/stripe-connect/route.ts")).toContain("data: { stripeConnectedAccountId: accountId, stripePayoutsEnabled: false },");
  });
});
