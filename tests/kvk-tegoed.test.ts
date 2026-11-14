import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Het KVK-tegoed (13 nov 2026): het gratis plan bij KVKBase was op, elke KVK-controle faalde met 429 QUOTA_EXCEEDED en de app
// noemde dat "rate limit". Nu: de soort limiet uit elkaar, het tegoed bewaard en getoond, 30 dagen cache per nummer, wachtende
// controles met een herkansing, en achtergrondtaken alleen ruim boven een reserve.

const h = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  fetch: vi.fn(),
  profiel: null as unknown,
  tenant: null as unknown,
  registerWerker: vi.fn(),
  registerBedrijf: vi.fn(),
  koppel: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ env: { KVKBASE_API_KEY: "test-sleutel", KVKBASE_API_URL: "https://kvkbase.test" } }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) } }));
vi.mock("@/lib/redis", () => ({
  cached: async (_k: string, _t: number, f: () => Promise<unknown>) => f(),
  withCircuitBreaker: async (_n: string, f: () => Promise<unknown>) => f(),
}));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (h.kv.has(k) ? h.kv.get(k) : null),
  kvSet: async (k: string, v: unknown) => void h.kv.set(k, v),
  kvDelete: async (k: string) => void h.kv.delete(k),
  kvListEntries: async (prefix: string) => [...h.kv].filter(([k]) => k.startsWith(prefix)).map(([key, value]) => ({ key, value })),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    freelancerProfile: { findUnique: async () => h.profiel },
    tenant: { findUnique: async () => h.tenant },
  },
}));
vi.mock("@/lib/company/registration", () => ({
  registerFreelancerCompany: (...a: unknown[]) => h.registerWerker(...a),
  registerTenantCompany: (...a: unknown[]) => h.registerBedrijf(...a),
}));
vi.mock("@/lib/onboarding/employer", () => ({ koppelKvkAanAanmelder: (...a: unknown[]) => h.koppel(...a) }));

import { AppError } from "@/lib/errors";
import {
  KVK_RESERVE,
  achtergrondMag,
  kvkLimietVan,
  limietUitAntwoord,
  tegoedLaag,
  tegoedTekst,
  tegoedUitAntwoord,
  volgendePoging,
  type KvkTegoed,
} from "@/lib/kvk/tegoed";
import { KVK_TEGOED_SLEUTEL, leesKvkTegoed, zetKvkWacht } from "@/lib/kvk/tegoed-opslag";
import { lookupCompany } from "@/lib/integrations/kvkbase";
import { kvkHerkansing } from "@/lib/kvk/herkansing";
import { kvkTegoedTodo } from "@/lib/admin/todo-kvk-tegoed";
import { isLimiet } from "@/lib/kvk/bronnen";
import { ERASABLE_KV_PREFIXES } from "@/lib/privacy/user-kv";

const kop = (h0: Record<string, string>) => new Headers(h0);
const tegoed = (t: Partial<KvkTegoed>): KvkTegoed => ({ tokens: 500, perMinuut: 60, op: false, at: "2026-11-13T12:00:00.000Z", ...t });

beforeEach(() => {
  h.kv.clear();
  h.fetch.mockReset();
  vi.stubGlobal("fetch", h.fetch);
  h.registerWerker.mockReset();
  h.registerBedrijf.mockReset();
  h.koppel.mockReset().mockResolvedValue({ inControle: false });
});

describe("het antwoord van KVKBase lezen", () => {
  it("tegoed en limiet per minuut uit de headers; QUOTA_EXCEEDED = op", () => {
    const nu = new Date("2026-11-13T12:00:00Z");
    expect(tegoedUitAntwoord(kop({ "x-tokens-remaining": "847", "x-ratelimit-limit": "60" }), null, nu)).toEqual({ tokens: 847, perMinuut: 60, op: false, at: nu.toISOString() });
    expect(tegoedUitAntwoord(kop({ "x-ratelimit-limit": "10" }), "QUOTA_EXCEEDED", nu)).toEqual({ tokens: 0, perMinuut: 10, op: true, at: nu.toISOString() });
    expect(tegoedUitAntwoord(kop({}), null, nu)).toBeNull();
  });

  it("de soort limiet: tegoed op of de minuutlimiet (met Retry-After, begrensd)", () => {
    expect(limietUitAntwoord(429, "QUOTA_EXCEEDED", null)).toEqual({ soort: "tegoed" });
    expect(limietUitAntwoord(402, null, null)).toEqual({ soort: "tegoed" });
    expect(limietUitAntwoord(429, "RATE_LIMIT_EXCEEDED", "30")).toEqual({ soort: "minuut", naSeconden: 30 });
    expect(limietUitAntwoord(429, "RATE_LIMIT_EXCEEDED", null)).toEqual({ soort: "minuut", naSeconden: 60 });
    expect(limietUitAntwoord(429, null, "99999")).toEqual({ soort: "minuut", naSeconden: 3600 });
    expect(limietUitAntwoord(404, "NOT_FOUND", null)).toBeNull();
  });

  it("een fout draagt de limiet mee; oudere Engelse meldingen herkennen we ook", () => {
    const e = new AppError("UPSTREAM_UNAVAILABLE", "Het tegoed van de KVK-dienst is op.", 503, { kvkLimiet: { soort: "tegoed" } });
    expect(kvkLimietVan(e)).toEqual({ soort: "tegoed" });
    expect(kvkLimietVan(new Error("KVKBase token quota exhausted"))).toEqual({ soort: "tegoed" });
    expect(kvkLimietVan(new Error("KVKBase rate limit reached, retry shortly"))).toEqual({ soort: "minuut", naSeconden: 60 });
    expect(kvkLimietVan(AppError.notFound("Geen inschrijving gevonden voor dit KVK-nummer."))).toBeNull();
    expect(isLimiet(e)).toBe(true);
  });
});

describe("reserve, melding en planning", () => {
  it("achtergrondtaken alleen met een bekend tegoed ruim boven de reserve", () => {
    expect(achtergrondMag(null, 1)).toBe(false);
    expect(achtergrondMag(tegoed({ op: true, tokens: 0 }), 1)).toBe(false);
    expect(achtergrondMag(tegoed({ tokens: KVK_RESERVE + 40 }), 40)).toBe(true);
    expect(achtergrondMag(tegoed({ tokens: KVK_RESERVE + 39 }), 40)).toBe(false);
    expect(achtergrondMag(tegoed({ tokens: null }), 1)).toBe(false);
  });

  it("laag = op of onder de 10; de herkansing bij tegoed de volgende dag 06:00 UTC, bij de minuutlimiet na Retry-After", () => {
    expect(tegoedLaag(tegoed({ tokens: 9 }))).toBe(true);
    expect(tegoedLaag(tegoed({ tokens: 10 }))).toBe(false);
    expect(tegoedLaag(null)).toBe(false);
    const nu = new Date("2026-11-13T23:30:00Z");
    expect(volgendePoging({ soort: "tegoed" }, nu).toISOString()).toBe("2026-11-14T06:00:00.000Z");
    expect(volgendePoging({ soort: "minuut", naSeconden: 30 }, nu).toISOString()).toBe("2026-11-13T23:30:30.000Z");
  });

  it("de regel in Beheer en de eigenaar-taak", () => {
    const w = () => "13-11 om 13:00";
    expect(tegoedTekst(null, 0, w)).toContain("nog niet gemeten");
    expect(tegoedTekst(tegoed({ op: true, tokens: 0, perMinuut: 10 }), 3, w)).toBe(
      "Tegoed bij KVKBase: op (gemeten 13-11 om 13:00). Plan: gratis (10 vragen per minuut, 50 tokens per maand). 3 controles wachten op een herkansing.",
    );
    expect(tegoedTekst(tegoed({ tokens: 847 }), 1, w)).toContain("847 tokens over");
    expect(kvkTegoedTodo(null, 0)).toBeNull();
    // werkers met een nog nooit gecontroleerd KVK-nummer (lib/kvk/inhalen.ts): de taak noemt het aantal en blijft open, ook zonder meting
    const zes = kvkTegoedTodo(null, 2, 6)!;
    expect(zes.title).toBe("6 werkers met een ongecontroleerd KVK-nummer: zij krijgen nog geen voorstellen");
    expect(zes.why).toContain("6 werkers hebben een KVK-nummer dat nog nooit is gecontroleerd");
    expect(zes.why).toContain("nooit een voorstel");
    expect(zes.done).toBe(false);
    expect([zes.title, zes.why, ...zes.how].join(" ")).not.toMatch(/@/);
    expect(kvkTegoedTodo(tegoed({ op: true, tokens: 0, perMinuut: 10 }), 2, 1)!.title).toContain("(1 werker zonder controle)");
    expect(kvkTegoedTodo(tegoed({ tokens: 847 }), 0, 0)).toMatchObject({ title: "KVK-tegoed: weer voldoende", done: true });
    const op = kvkTegoedTodo(tegoed({ op: true, tokens: 0, perMinuut: 10 }), 2);
    expect(op?.done).toBe(false);
    expect(op?.title).toContain("KVK-tegoed op");
    expect(op?.why).toContain("nu 2 wachtend");
    expect(kvkTegoedTodo(tegoed({ tokens: 500 }), 0)?.done).toBe(true);
  });
});

describe("lookupCompany: de echte soort fout, het tegoed bewaard, 30 dagen per nummer", () => {
  const antwoord = (status: number, body: unknown, headers: Record<string, string>) =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } }));

  it("tegoed op: een fout met kvkLimiet 'tegoed', en het tegoed staat op 'op'", async () => {
    h.fetch.mockImplementation(() => antwoord(429, { error: { code: "QUOTA_EXCEEDED", message: "Monthly token allowance exhausted" } }, { "x-ratelimit-limit": "10" }));
    const fout = await lookupCompany("12345678", { enrich: true }).catch((e: unknown) => e);
    expect(kvkLimietVan(fout)).toEqual({ soort: "tegoed" });
    expect((fout as Error).message).toBe("Het tegoed van de KVK-dienst is op.");
    await new Promise((r) => setTimeout(r, 0));
    expect(await leesKvkTegoed()).toMatchObject({ op: true, tokens: 0, perMinuut: 10 });
  });

  it("de minuutlimiet: een fout met kvkLimiet 'minuut' en de wachttijd", async () => {
    h.fetch.mockImplementation(() => antwoord(429, { error: { code: "RATE_LIMIT_EXCEEDED" } }, { "retry-after": "20" }));
    const fout = await lookupCompany("12345678").catch((e: unknown) => e);
    expect(kvkLimietVan(fout)).toEqual({ soort: "minuut", naSeconden: 20 });
  });

  it("een gelukt antwoord: tegoed bewaard en 30 dagen per nummer, daarna geen nieuwe vraag", async () => {
    h.fetch.mockImplementation(() => antwoord(200, { kvkNumber: "12345678", name: "Testbedrijf", enriched: true }, { "x-tokens-remaining": "41", "x-ratelimit-limit": "10" }));
    await lookupCompany("12345678", { enrich: true });
    await lookupCompany("12345678", { enrich: true });
    // ook zonder enrich mag het antwoord met enrich van eerder
    await lookupCompany("12345678");
    expect(h.fetch).toHaveBeenCalledTimes(1);
    await new Promise((r) => setTimeout(r, 0));
    expect(h.kv.get(KVK_TEGOED_SLEUTEL)).toMatchObject({ tokens: 41, op: false });
  });

  it("niet gevonden telt ook 30 dagen: de tweede keer zonder vraag", async () => {
    h.fetch.mockImplementation(() => antwoord(404, { error: { code: "NOT_FOUND" } }, {}));
    await expect(lookupCompany("87654321")).rejects.toMatchObject({ status: 404 });
    await expect(lookupCompany("87654321")).rejects.toMatchObject({ status: 404 });
    expect(h.fetch).toHaveBeenCalledTimes(1);
  });
});

describe("de herkansing", () => {
  const nu = new Date("2026-11-14T07:00:00Z");
  const zet = (soort: "werker" | "bedrijf", id: string, kvk = "12345678") => zetKvkWacht(soort, id, kvk, { soort: "tegoed" }, new Date("2026-11-13T12:00:00Z"));

  it("een werker aan de beurt: opnieuw gecontroleerd, daarna uit de wacht", async () => {
    await zet("werker", "u1");
    h.profiel = { id: "fp1", kvkNumber: "12345678" };
    h.registerWerker.mockResolvedValue({ kvkValid: true });
    // ingehaald 0: in deze test is er geen prisma.freelancerProfile.findMany, en het inhalen faalt open (lib/kvk/inhalen.ts)
    expect(await kvkHerkansing(nu)).toEqual({ ingehaald: 0, aanDeBeurt: 1, gelukt: 1, weerInDeWacht: 0, vervallen: 0 });
    expect(h.registerWerker).toHaveBeenCalledWith({ freelancerProfileId: "fp1", kvkNumber: "12345678", allowInactive: true });
    expect(h.kv.has("kvk-wacht:werker:u1")).toBe(false);
  });

  it("een bedrijf: de inschrijving en daarna de koppeling aan de aanmelder", async () => {
    await zet("bedrijf", "t1");
    h.tenant = { id: "t1", kvkNumber: null, memberships: [{ userId: "u9" }] };
    const profiel = { legalName: "Testbedrijf BV", tradeName: null, kvkNumber: "12345678" };
    h.registerBedrijf.mockResolvedValue({ kvkValid: true, profile: profiel });
    await kvkHerkansing(nu);
    expect(h.koppel).toHaveBeenCalledWith("t1", "u9", profiel);
    expect(h.kv.has("kvk-wacht:bedrijf:t1")).toBe(false);
  });

  it("tegoed nog op: weer in de wacht tot morgen, en de rest van de ronde niet geprobeerd", async () => {
    await zet("werker", "u1");
    await zet("werker", "u2");
    h.profiel = { id: "fp1", kvkNumber: "12345678" };
    h.registerWerker.mockRejectedValue(new AppError("UPSTREAM_UNAVAILABLE", "Het tegoed van de KVK-dienst is op.", 503, { kvkLimiet: { soort: "tegoed" } }));
    const uit = await kvkHerkansing(nu);
    expect(uit).toMatchObject({ aanDeBeurt: 2, weerInDeWacht: 1, gelukt: 0 });
    expect(h.registerWerker).toHaveBeenCalledTimes(1);
    const wacht = [...h.kv].filter(([k]) => k.startsWith("kvk-wacht:")).map(([, v]) => v as { volgende: string; pogingen: number });
    expect(wacht.some((w) => w.volgende === "2026-11-15T06:00:00.000Z" && w.pogingen === 2)).toBe(true);
  });

  it("niet aan de beurt, of het nummer intussen veranderd", async () => {
    await zetKvkWacht("werker", "u1", "12345678", { soort: "minuut", naSeconden: 60 }, nu);
    expect((await kvkHerkansing(nu)).aanDeBeurt).toBe(0);
    h.kv.clear();
    await zet("werker", "u2");
    h.profiel = { id: "fp2", kvkNumber: "11112222" };
    expect(await kvkHerkansing(nu)).toMatchObject({ vervallen: 1, gelukt: 0 });
    expect(h.registerWerker).not.toHaveBeenCalled();
  });
});

describe("bewakers", () => {
  it("de cron draait elke 30 minuten en staat in de hartslag", () => {
    expect(readFileSync("deploy/cron/entrypoint.sh", "utf8")).toMatch(/\*\/30 \* \* \* \* .*\/api\/internal\/kvk\/herkansing/);
    expect(readFileSync("lib/ops/heartbeat.ts", "utf8")).toContain('job: "kvk-herkansing"');
  });

  it("de wachtende controle van een werker gaat mee bij inzage en wissen", () => {
    expect(ERASABLE_KV_PREFIXES).toContain("kvk-wacht:werker:");
  });

  it("werker en werkgever krijgen dezelfde eerlijke tekst", () => {
    const tekst = "We controleren je KVK-nummer later; je kunt verder met je aanmelding.";
    expect(readFileSync("lib/onboarding/verify.ts", "utf8")).toContain(tekst);
    expect(readFileSync("lib/onboarding/employer.ts", "utf8")).toContain(tekst);
  });
});
