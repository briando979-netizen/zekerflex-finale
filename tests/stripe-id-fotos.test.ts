import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stripeBestandId, stripeFotoSleutelFout, sleutelEind } from "@/lib/kyc/stripe-fotos-vorm";

// Admin → Gebruikers (eigenaar 11 nov): ook bij een werker die via Stripe is gecontroleerd de
// voorkant, achterkant en selfie zien. Stripe geeft die alleen aan een beperkte sleutel (rk_…);
// de foto gaat via een link van 30 seconden rechtstreeks door, zonder kopie bij ons.

const m = vi.hoisted(() => ({
  opgeslagen: null as unknown,
  retrieve: vi.fn(),
  list: vi.fn(),
  link: vi.fn(),
  sleutels: [] as string[],
  warn: vi.fn(),
}));

vi.mock("stripe", () => ({
  default: class {
    identity = { verificationSessions: { retrieve: m.retrieve, list: m.list } };
    fileLinks = { create: m.link };
    constructor(sleutel: string) {
      m.sleutels.push(sleutel);
    }
  },
}));
vi.mock("@/lib/env", () => ({ env: { STRIPE_SECRET_KEY: "sk_live_abc", AUTH_SECRET: "x".repeat(40) } }));
vi.mock("@/lib/logger", () => ({ logger: { warn: m.warn, info: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: vi.fn(async () => m.opgeslagen),
  kvSet: vi.fn(async (_k: string, v: unknown) => {
    m.opgeslagen = v;
  }),
  kvDelete: vi.fn(async () => {
    m.opgeslagen = null;
  }),
}));

// in stukken, zodat de geheimscanner van GitHub er geen echte sleutel in ziet
const nep = (soort: string) => [soort, "51AbCdEfGhIjKlMnOpQrStUvWxYz"].join("_");
const SLEUTEL = nep("rk_live");
const rapport = { document: { files: ["file_voor1", "file_achter2"] }, selfie: { selfie: "file_gezicht3", document: "file_voor1" } };

describe("welk Stripe-bestand bij welke foto", () => {
  it("voorkant en achterkant uit document.files, de selfie uit selfie.selfie", () => {
    expect(stripeBestandId(rapport, "front")).toBe("file_voor1");
    expect(stripeBestandId(rapport, "back")).toBe("file_achter2");
    expect(stripeBestandId(rapport, "selfie")).toBe("file_gezicht3");
    expect(stripeBestandId(rapport, "selfie2")).toBeNull(); // de tweede selfie bestaat alleen bij de eigen controle
  });

  it("een paspoort heeft geen achterkant; zonder rechten of rapport: niets", () => {
    expect(stripeBestandId({ document: { files: ["file_voor1"] } }, "back")).toBeNull();
    for (const leeg of [null, "rep_123", {}, { document: { files: null } }, { selfie: { selfie: "https://evil" } }]) {
      expect(stripeBestandId(leeg, "front")).toBeNull();
      expect(stripeBestandId(leeg, "selfie")).toBeNull();
    }
  });

  it("alleen een beperkte live-sleutel; de geheime sleutel of een testsleutel wordt geweigerd", () => {
    expect(stripeFotoSleutelFout(SLEUTEL, true)).toBeNull();
    expect(stripeFotoSleutelFout(`  ${SLEUTEL}\n`, true)).toBeNull();
    expect(stripeFotoSleutelFout(nep("sk_live"), true)).toMatch(/gewone geheime sleutel/);
    expect(stripeFotoSleutelFout(nep("rk_test"), true)).toMatch(/testsleutel/);
    expect(stripeFotoSleutelFout(nep("rk_test"), false)).toBeNull();
    expect(stripeFotoSleutelFout("hallo", true)).toMatch(/rk_live_/);
    expect(sleutelEind(SLEUTEL)).toBe("WxYz");
  });
});

describe("een foto ophalen bij Stripe", () => {
  beforeEach(() => {
    m.opgeslagen = null;
    m.sleutels.length = 0;
    m.retrieve.mockReset().mockResolvedValue({ id: "vs_1", last_verification_report: rapport });
    m.list.mockReset().mockResolvedValue({ data: [] });
    m.link.mockReset().mockResolvedValue({ url: "https://files.stripe.com/links/geheim" });
    m.warn.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array([0xff, 0xd8, 0xff]), { status: 200, headers: { "content-type": "image/jpeg" } })),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("zonder sleutel: een uitleg, geen aanroep bij Stripe", async () => {
    const { stripeIdFoto } = await import("@/lib/kyc/stripe-fotos");
    const r = await stripeIdFoto("vs_1", "front");
    expect(r).toEqual({ ok: false, reden: expect.stringMatching(/nog geen Stripe-sleutel/) });
    expect(m.retrieve).not.toHaveBeenCalled();
  });

  it("met sleutel: rapport ophalen, link van hooguit 30 seconden, bytes doorgeven", async () => {
    const { bewaarStripeFotoSleutel, stripeIdFoto, stripeFotoSleutelInfo } = await import("@/lib/kyc/stripe-fotos");
    const info = await bewaarStripeFotoSleutel(SLEUTEL, "Beheerder");
    expect(info.eind).toBe("WxYz");
    // verzegeld bewaard: de sleutel staat nergens leesbaar in de KV
    expect(JSON.stringify(m.opgeslagen)).not.toContain(SLEUTEL);
    expect(await stripeFotoSleutelInfo()).toEqual({ eind: "WxYz", ingesteldOp: expect.any(String), door: "Beheerder" });

    const nu = Math.floor(Date.now() / 1000);
    const r = await stripeIdFoto("vs_1", "selfie");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.mimeType).toBe("image/jpeg");
    expect(m.sleutels.at(-1)).toBe(SLEUTEL);
    expect(m.retrieve).toHaveBeenCalledWith("vs_1", { expand: ["last_verification_report"] });
    const [{ file, expires_at }] = m.link.mock.calls.at(-1) as [{ file: string; expires_at: number }];
    expect(file).toBe("file_gezicht3");
    expect(expires_at - nu).toBeLessThanOrEqual(31);
  });

  it("een fout van Stripe wordt gewone taal, en de link komt nooit in het log", async () => {
    const { bewaarStripeFotoSleutel, stripeIdFoto } = await import("@/lib/kyc/stripe-fotos");
    await bewaarStripeFotoSleutel(SLEUTEL, "Beheerder");
    m.link.mockRejectedValueOnce(Object.assign(new Error("The provided key does not have access"), { type: "StripePermissionError" }));
    const r = await stripeIdFoto("vs_1", "front");
    expect(r).toEqual({ ok: false, reden: expect.stringMatching(/mist een recht/) });
    expect(JSON.stringify(m.warn.mock.calls)).not.toMatch(/files\.stripe\.com|rk_live/);

    // een paspoort: geen achterkant
    m.retrieve.mockResolvedValueOnce({ id: "vs_1", last_verification_report: { document: { files: ["file_voor1"] } } });
    expect(await stripeIdFoto("vs_1", "back")).toEqual({ ok: false, reden: expect.stringMatching(/geen achterkant/) });
  });

  it("een sleutel die Stripe weigert, wordt niet bewaard", async () => {
    const { bewaarStripeFotoSleutel } = await import("@/lib/kyc/stripe-fotos");
    m.list.mockRejectedValueOnce(Object.assign(new Error("Invalid API Key provided"), { type: "StripeAuthenticationError" }));
    await expect(bewaarStripeFotoSleutel(SLEUTEL, "Beheerder")).rejects.toThrow(/kent deze sleutel niet/);
    expect(m.opgeslagen).toBeNull();
    await expect(bewaarStripeFotoSleutel(nep("sk_live"), "Beheerder")).rejects.toThrow(/gewone geheime sleutel/);
  });
});

describe("routes en scherm", () => {
  const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");

  it("de sleutelroute is alleen voor platformbeheerders en geeft de sleutel nooit terug", () => {
    const route = lees("app/api/admin/kyc/stripe-sleutel/route.ts");
    expect(route.match(/withAdminAccess\(\["PLATFORM_ADMIN"\]/g)?.length).toBe(3);
    expect(route).not.toMatch(/openSecret/);
    expect(route).not.toMatch(/json\([^)]*parsed\.data/);
  });

  it("de fotoroute haalt een Stripe-foto via de sleutel en laat de browser hem niet bewaren", () => {
    const route = lees("app/api/admin/gebruikers/[id]/identiteit/[checkId]/beeld/route.ts");
    expect(route).toMatch(/stripeIdFoto\(check\.sessionId, welk\)/);
    expect(route).toMatch(/private, no-store/);
  });

  it("de gebruikerspagina: selfie in het rondje als er geen profielfoto is, en de sleutel instellen", () => {
    const pagina = lees("app/admin/gebruikers/[id]/page.tsx");
    expect(pagina).toMatch(/<KopFoto src=\{kopSelfie\}/);
    expect(pagina).toMatch(/<StripeFotoSleutel begin=\{stripeSleutel\} \/>/);
    expect(pagina).toMatch(/<IdFoto key=/);
  });
});
