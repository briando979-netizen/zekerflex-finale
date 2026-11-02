import { beforeEach, describe, expect, it, vi } from "vitest";

// Telefonie: nummers + opties + bundels samenstellen (lib/telephony/plans.ts) en
// aanvragen (lib/telephony/lines.ts). De prijs komt altijd van de server.

const kv = vi.hoisted(() => new Map<string, unknown>());
const alerts = vi.hoisted(() => [] as unknown[]);
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void kv.set(k, v),
  kvListValues: async (prefix: string) => [...kv.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => v),
}));
vi.mock("@/lib/audit", () => ({ recordAudit: async () => undefined }));
vi.mock("@/lib/ops/alert", () => ({ alertOwner: async (a: unknown) => void alerts.push(a) }));

import { DEFAULT_PRICING, quote } from "@/lib/telephony/plans";
import { adminUpdateLine, adminUpdateSchema, cancelLineRequest, createLineRequest, getPricing, linesOf, requestSchema } from "@/lib/telephony/lines";

beforeEach(() => {
  kv.clear();
  alerts.length = 0;
});

const base = { scope: "bedrijf", kind: "mobiel097", bundle: null, options: [], answerAt: [], showOn: [] };
const boss = { userId: "u1", name: "Anna", email: "anna@bakkerij.nl", tenantId: "t1", orgName: "Bakkerij Jansen" };

describe("prijs samenstellen", () => {
  it("een bundel is de lijn plus opties; losse extra's komen erbij", () => {
    const q = quote({ kind: "mobiel097", bundle: "start", options: ["ai"] });
    expect(q.monthlyCents).toBe(DEFAULT_PRICING.bundleCents.start + DEFAULT_PRICING.optionCents.ai);
    expect(q.lines.map((l) => l.label)).toEqual(["Bundel Start (lijn + 2 opties)", "AI-assistent"]);
    expect(q.onRequest).toBe(false);
  });

  it("wijst op een goedkopere bundel als losse opties meer kosten", () => {
    const q = quote({ kind: "mobiel097", bundle: null, options: ["voicemail", "doorschakelen", "keuzemenu", "team", "sms"] });
    const loose = DEFAULT_PRICING.lineCents + 295 + 495 + 495 + 795 + 395;
    expect(q.monthlyCents).toBe(loose);
    expect(q.tip).toEqual({ bundle: "zakelijk", saveCents: loose - DEFAULT_PRICING.bundleCents.zakelijk });
    // al de goedkoopste keuze: geen tip
    expect(quote({ kind: "mobiel097", bundle: "compleet", options: [] }).tip).toBeNull();
    expect(quote({ kind: "mobiel097", bundle: null, options: [] }).tip).toBeNull();
  });

  it("een 06-nummer is op aanvraag: geen bedrag verzonnen", () => {
    const q = quote({ kind: "mobiel06", bundle: "start", options: [] });
    expect(q.onRequest).toBe(true);
    expect(q.lines.find((l) => l.label === "Nieuw 06-nummer")?.cents).toBeNull();
    expect(q.monthlyCents).toBe(DEFAULT_PRICING.bundleCents.start);
  });

  it("de eigenaar past prijzen aan zonder code; de rest blijft standaard", async () => {
    kv.set("telefonie:pricing", { bundleCents: { start: 1995 } });
    const p = await getPricing();
    expect(p.bundleCents.start).toBe(1995);
    expect(p.bundleCents.zakelijk).toBe(DEFAULT_PRICING.bundleCents.zakelijk);
    expect(p.lineCents).toBe(DEFAULT_PRICING.lineCents);
  });
});

describe("aanvragen", () => {
  it("rekent de prijs zelf uit, met de prijzen van de eigenaar", async () => {
    kv.set("telefonie:pricing", { bundleCents: { start: 1995 } });
    const line = await createLineRequest(boss, requestSchema.parse({ ...base, bundle: "start", answerAt: ["telefoon"], forwardTo: "06 12345678" }));
    expect(line.quote.monthlyCents).toBe(1995);
    expect(line.forwardTo).toBe("+31612345678");
    expect(line.selection.options).toEqual(expect.arrayContaining(["voicemail", "doorschakelen"]));
    expect(line.status).toBe("aangevraagd");
    expect(alerts).toHaveLength(1);
  });

  it("vraagt om de ontbrekende gegevens", async () => {
    await expect(createLineRequest(boss, requestSchema.parse({ ...base, kind: "eigen" }))).rejects.toThrow(/dat je wilt houden/);
    await expect(createLineRequest(boss, requestSchema.parse({ ...base, kind: "lokaal" }))).rejects.toThrow(/stad/);
    await expect(createLineRequest(boss, requestSchema.parse({ ...base, answerAt: ["telefoon"] }))).rejects.toThrow(/doorschakelen/);
    expect(() => requestSchema.parse({ ...base, forwardTo: "bel me" })).toThrow(/geldig telefoonnummer/);
    expect(() => requestSchema.parse({ ...base, options: ["gratis-goud"] })).toThrow();
  });

  it("een flexkracht vraagt voor zichzelf aan; 'bij diensten tonen' bestaat daar niet; testaccounts storen de eigenaar niet", async () => {
    const line = await createLineRequest(
      { userId: "u9", name: "Test", email: "zf-authtest@zekerflex.test", tenantId: null, orgName: null },
      requestSchema.parse({ ...base, scope: "persoonlijk", showOn: ["profiel", "diensten"] }),
    );
    expect(line.tenantId).toBeNull();
    expect(line.showOn).toEqual(["profiel"]);
    expect(alerts).toHaveLength(0);
  });

  it("toont elk bedrijf alleen zijn eigen lijnen, en annuleren kan alleen zolang niets is gestart", async () => {
    const mine = await createLineRequest(boss, requestSchema.parse(base));
    await createLineRequest({ ...boss, userId: "u2", tenantId: "t2", orgName: "Ander bv" }, requestSchema.parse(base));
    expect((await linesOf("bedrijf", "t1")).map((l) => l.id)).toEqual([mine.id]);
    await expect(cancelLineRequest(mine.id, "bedrijf", "t2", "Iemand")).rejects.toThrow(/niet gevonden/);
    await adminUpdateLine({ id: mine.id, status: "in_behandeling" }, { userId: "a1", name: "Beheer" });
    await expect(cancelLineRequest(mine.id, "bedrijf", "t1", "Anna")).rejects.toThrow(/in behandeling/);
  });

  it("actief zetten kan alleen met een toegewezen nummer", async () => {
    const line = await createLineRequest(boss, requestSchema.parse(base));
    await expect(adminUpdateLine(adminUpdateSchema.parse({ id: line.id, status: "actief" }), { userId: "a1", name: "Beheer" })).rejects.toThrow(/nummer/);
    // zoals de beheerroute: eerst door het schema, dat het nummer netjes maakt
    const done = await adminUpdateLine(adminUpdateSchema.parse({ id: line.id, status: "actief", number: "097 010 251 797" }), { userId: "a1", name: "Beheer" });
    expect(done.number).toBe("+3197010251797");
    expect(done.history.map((h) => h.status)).toEqual(["aangevraagd", "actief"]);
  });
});
