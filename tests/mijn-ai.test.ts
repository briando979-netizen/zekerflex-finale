import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mijn AI (15 nov): een eigen chatomgeving voor de eigenaar in Beheer → ZekerFlex AI, ingericht zoals Claude. Alleen je
// eigen gesprekken; het antwoord komt woord voor woord; je vraag is meteen bewaard; een afgebroken antwoord blijft staan
// (onaf); "opnieuw" vervangt het laatste antwoord. Naar het model: een vaste instructie bovenaan en het gesprek ingekort.

const kv = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (kv.has(k) ? structuredClone(kv.get(k)) : null),
  kvSet: async (k: string, v: unknown) => void kv.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void kv.delete(k),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
const m = vi.hoisted(() => ({ wie: "admin-1", stukken: [] as string[], fout: null as string | null, berichten: [] as unknown[] }));
vi.mock("@/lib/auth/handlers", () => ({
  withAdminAccess:
    (_roles: string[], handler: (req: Request, ctx: { principal: { userId: string }; params: unknown }) => Promise<Response>) =>
    async (req: Request, ctx?: { params?: Promise<unknown> }) => {
      try {
        return await handler(req, { principal: { userId: m.wie }, params: (await ctx?.params) ?? {} });
      } catch (e) {
        const f = e as { status?: number; message: string };
        return Response.json({ error: { message: f.message } }, { status: f.status ?? 500 });
      }
    },
}));
vi.mock("@/lib/ai/client", () => ({
  chatStream: async function* (opts: { messages: unknown[] }) {
    m.berichten = opts.messages;
    for (const s of m.stukken) yield s;
    if (m.fout) throw new Error(m.fout);
    return { text: m.stukken.join(""), model: "gemma3:4b" };
  },
}));
vi.mock("@/lib/ai/models", () => ({ modelForPurpose: () => "gemma3:4b" }));
vi.mock("@/lib/ai/gratis", () => ({ gratisAan: () => true, primeGratis: async () => undefined }));
vi.mock("@/lib/logger", () => ({ logger: { warn: () => undefined, info: () => undefined, error: () => undefined } }));

import { berichtenVoorModel, foutZin, groepeerOpDag, MIJN_AI_INSTRUCTIE, STROOM_EINDE, titelVan, type MijnAiBericht } from "@/lib/mijn-ai/vorm";
import { ERASABLE_KV_PREFIXES } from "@/lib/privacy/user-kv";

const lijstRoute = await import("@/app/api/admin/mijn-ai/route");
const gesprekRoute = await import("@/app/api/admin/mijn-ai/[id]/route");
const vraagRoute = await import("@/app/api/admin/mijn-ai/[id]/vraag/route");

type H = (req: Request, ctx?: { params: Promise<{ id: string }> }) => Promise<Response>;
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const nieuw = async () => (await (await (lijstRoute.POST as unknown as H)(new Request("http://x", { method: "POST" }))).json()).gesprek as { id: string };
const vraag = async (id: string, body: unknown) => {
  const res = await (vraagRoute.POST as unknown as H)(new Request("http://x", { method: "POST", body: JSON.stringify(body) }), ctx(id));
  return { status: res.status, tekst: await res.text() };
};
const lees = async (id: string) => (gesprekRoute.GET as unknown as H)(new Request("http://x"), ctx(id));

beforeEach(() => {
  kv.clear();
  m.wie = "admin-1";
  m.stukken = ["Hallo ", "daar"];
  m.fout = null;
});

describe("wat er naar het model gaat", () => {
  const b = (rol: "jij" | "ai", tekst: string, onaf = false): MijnAiBericht => ({ rol, tekst, at: "", ...(onaf ? { onaf: true } : {}) });

  it("de vaste instructie bovenaan, het gesprek, dan de vraag; afgebroken antwoorden niet", () => {
    const uit = berichtenVoorModel([b("jij", "v1"), b("ai", "a1"), b("jij", "v2"), b("ai", "half", true)], "v3", false);
    expect(uit[0]).toEqual({ role: "system", content: MIJN_AI_INSTRUCTIE });
    expect(uit.slice(1).map((x) => x.content)).toEqual(["v1", "a1", "v2", "v3"]);
  });

  it("met alles gratis ingekort tot het budget, en altijd beginnend met een vraag", () => {
    const lang = Array.from({ length: 10 }, (_, i) => [b("jij", `vraag ${i} `.repeat(30)), b("ai", `antwoord ${i} `.repeat(60))]).flat();
    const gratis = berichtenVoorModel(lang, "nu", true);
    const ruim = berichtenVoorModel(lang, "nu", false);
    expect(gratis.length).toBeLessThan(ruim.length);
    expect(gratis.slice(1, -1).reduce((n, x) => n + x.content.length, 0)).toBeLessThanOrEqual(4000);
    expect(gratis[1]?.role).toBe("user");
  });

  it("titel uit de eerste vraag; een fout als gewone zin; dagen in Nederlandse tijd", () => {
    expect(titelVan("  Hoe   schrijf ik\neen offerte?  ")).toBe("Hoe schrijf ik een offerte?");
    expect(titelVan("x".repeat(200)).length).toBe(80);
    expect(foutZin("LLM gaf geen eerste woord binnen 50000ms")).toContain("niet snel genoeg");
    const nu = new Date("2026-11-15T00:30:00+01:00");
    const groepen = groepeerOpDag(
      [
        { id: "1", titel: "vannacht", bijgewerkt: "2026-11-14T23:10:00Z" },
        { id: "2", titel: "gisteravond", bijgewerkt: "2026-11-14T22:50:00Z" },
        { id: "3", titel: "vorige week", bijgewerkt: "2026-11-01T10:00:00Z" },
      ],
      nu,
    );
    expect(groepen.map((g) => [g.groep, g.gesprekken.map((x) => x.titel)])).toEqual([
      ["vandaag", ["vannacht"]],
      ["gisteren", ["gisteravond"]],
      ["ouder", ["vorige week"]],
    ]);
  });
});

describe("de routes", () => {
  it("een vraag: het antwoord stroomt, daarna de afloop; vraag, antwoord en titel bewaard", async () => {
    const g = await nieuw();
    const r = await vraag(g.id, { tekst: "Schrijf een korte mail" });
    expect(r.status).toBe(200);
    expect(r.tekst).toBe(`Hallo daar${STROOM_EINDE}{}`);
    const gesprek = (await (await lees(g.id)).json()).gesprek;
    expect(gesprek.titel).toBe("Schrijf een korte mail");
    expect(gesprek.berichten.map((x: MijnAiBericht) => [x.rol, x.tekst, x.model ?? null])).toEqual([
      ["jij", "Schrijf een korte mail", null],
      ["ai", "Hallo daar", "gemma3:4b"],
    ]);
    const lijst = await (await (lijstRoute.GET as unknown as H)(new Request("http://x"))).json();
    expect(lijst).toMatchObject({ model: "gemma3:4b", gratis: true, gesprekken: [{ id: g.id, titel: "Schrijf een korte mail" }] });
  });

  it("een vervolgvraag krijgt het gesprek mee; opnieuw vervangt het laatste antwoord", async () => {
    const g = await nieuw();
    await vraag(g.id, { tekst: "Eerste" });
    m.stukken = ["Tweede antwoord"];
    await vraag(g.id, { tekst: "Tweede" });
    expect((m.berichten as { content: string }[]).map((x) => x.content)).toEqual([MIJN_AI_INSTRUCTIE, "Eerste", "Hallo daar", "Tweede"]);
    m.stukken = ["Beter antwoord"];
    expect((await vraag(g.id, { opnieuw: true })).status).toBe(200);
    const berichten = (await (await lees(g.id)).json()).gesprek.berichten as MijnAiBericht[];
    expect(berichten.map((x) => x.tekst)).toEqual(["Eerste", "Hallo daar", "Tweede", "Beter antwoord"]);
  });

  it("het model valt halverwege weg: wat er was blijft staan (onaf), en een gewone zin", async () => {
    const g = await nieuw();
    m.stukken = ["Een begin"];
    m.fout = "LLM-stroom afgebroken (runner)";
    const r = await vraag(g.id, { tekst: "Vertel iets" });
    const [tekst, staart] = r.tekst.split(STROOM_EINDE);
    expect(tekst).toBe("Een begin");
    expect(JSON.parse(staart!).fout).toContain("niet snel genoeg");
    const laatste = ((await (await lees(g.id)).json()).gesprek.berichten as MijnAiBericht[]).at(-1);
    expect(laatste).toMatchObject({ rol: "ai", tekst: "Een begin", onaf: true });
  });

  it("alleen je eigen gesprekken; een lege vraag of niets om opnieuw te doen: 422", async () => {
    const g = await nieuw();
    expect((await vraag(g.id, { tekst: "  " })).status).toBe(422);
    expect((await vraag(g.id, { opnieuw: true })).status).toBe(422);
    m.wie = "admin-2";
    expect((await lees(g.id)).status).toBe(404);
    expect((await vraag(g.id, { tekst: "Hoi" })).status).toBe(404);
    expect((await (await (lijstRoute.GET as unknown as H)(new Request("http://x"))).json()).gesprekken).toEqual([]);
  });

  it("hernoemen en weghalen", async () => {
    const g = await nieuw();
    const patch = await (gesprekRoute.PATCH as unknown as H)(new Request("http://x", { method: "PATCH", body: JSON.stringify({ titel: "Mijn plan" }) }), ctx(g.id));
    expect((await patch.json()).gesprek.titel).toBe("Mijn plan");
    expect((await (gesprekRoute.DELETE as unknown as H)(new Request("http://x", { method: "DELETE" }), ctx(g.id))).status).toBe(200);
    expect((await lees(g.id)).status).toBe(404);
    expect([...kv.keys()].filter((k) => k.startsWith("mijn-ai:"))).toEqual([]);
  });
});

describe("in het beheer", () => {
  it("in het menu, alleen voor platformbeheerders, en onder inzage en wissen", () => {
    const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");
    expect(lees("lib/admin/nav.ts")).toContain('{ href: "/admin/zekerflex-ai/mijn-ai", label: "Mijn AI" }');
    expect(lees("app/admin/zekerflex-ai/mijn-ai/page.tsx")).toContain('hasRole(principal, "PLATFORM_ADMIN")');
    expect(ERASABLE_KV_PREFIXES).toEqual(expect.arrayContaining(["mijn-ai-lijst:", "mijn-ai:"]));
  });
});
