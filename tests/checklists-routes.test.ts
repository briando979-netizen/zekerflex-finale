import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  admin: true,
  ingelogd: true,
  limiet: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (m.kv.has(k) ? structuredClone(m.kv.get(k)) : null),
  kvSet: async (k: string, v: unknown) => void m.kv.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void m.kv.delete(k),
  kvListValues: async (p: string, limit: number) => [...m.kv].filter(([k]) => k.startsWith(p)).slice(0, limit).map(([, v]) => structuredClone(v)),
  kvListEntries: async (p: string, limit: number) => [...m.kv].filter(([k]) => k.startsWith(p)).slice(0, limit).map(([key, v]) => ({ key, value: structuredClone(v) })),
}));
vi.mock("@/lib/auth", async () => {
  const { AppError } = await import("@/lib/errors");
  return {
    requirePrincipal: async () => {
      if (!m.ingelogd) throw AppError.unauthenticated();
      return { userId: "u1" };
    },
    hasRole: () => m.admin,
  };
});
vi.mock("@/lib/dashboard/employer", () => ({ resolveEmployerScope: async () => ({ tenantIds: ["t1"] }) }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: (...a: unknown[]) => m.limiet(...a) }));
vi.mock("@/lib/audit", () => ({ recordAudit: (...a: unknown[]) => m.audit(...a) }));
vi.mock("@/lib/prisma", () => ({ prisma: { tenant: { findUnique: async () => ({ name: "Schoonmaak Jansen" }) } } }));

import * as lijst from "@/app/api/werkgever/checklists/route";
import * as een from "@/app/api/werkgever/checklists/[id]/route";
import * as link from "@/app/api/werkgever/checklists/[id]/link/route";
import * as uitv from "@/app/api/werkgever/checklists/uitvoeringen/route";
import * as uitvoerders from "@/app/api/werkgever/checklists/uitvoerders/route";
import { sjabloonVanSleutel } from "@/lib/checklists/store";

const json = (method: string, p: string, body?: unknown) => new Request(`http://app:3000${p}`, { method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const id = (s: string) => ({ params: Promise.resolve({ id: s }) });
const lees = async (r: Response) => (await r.json()) as Record<string, any>;

const sjabloonBody = (over: Record<string, unknown> = {}) => ({
  naam: "Sluitronde",
  locatie: "Keuken",
  taken: [{ tekst: "Vloer" }, { tekst: "Afval", opmerkingVerplicht: true }],
  herhaling: { soort: "dagelijks", uiterlijk: "07:00" },
  ...over,
});

async function maak(over: Record<string, unknown> = {}) {
  const res = await lijst.POST(json("POST", "/api/werkgever/checklists", sjabloonBody(over)));
  return (await lees(res)).sjabloon as { id: string; taken: { id: string }[] };
}
const antwoorden = (s: { taken: { id: string }[] }, gedaan = true) => s.taken.map((t) => ({ id: t.id, gedaan, opmerking: gedaan ? "" : "Geen tijd" }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-12T10:00:00Z")); // donderdag 11:00 in Nederland
  m.kv.clear();
  m.admin = true;
  m.ingelogd = true;
  m.limiet.mockReset().mockResolvedValue(undefined);
  m.audit.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

describe("toegang", () => {
  it("uitgelogd geeft 401", async () => {
    m.ingelogd = false;
    expect((await lijst.GET(json("GET", "/api/werkgever/checklists"))).status).toBe(401);
  });
  it("een lid zonder beheerdersrol krijgt 423 met een eigen code, nooit 403, op elke route", async () => {
    m.admin = false;
    const antwoorden = [
      await lijst.GET(json("GET", "/api/werkgever/checklists")),
      await lijst.POST(json("POST", "/api/werkgever/checklists", sjabloonBody())),
      await een.PUT(json("PUT", "/api/werkgever/checklists/abc123", sjabloonBody()), id("abc123")),
      await link.POST(json("POST", "/x"), id("abc123")),
      await link.DELETE(json("DELETE", "/x"), id("abc123")),
      await uitv.GET(json("GET", "/x")),
      await uitv.POST(json("POST", "/x", {})),
      await uitvoerders.GET(),
      await uitvoerders.DELETE(json("DELETE", "/x", { naam: "Piet" })),
    ];
    for (const r of antwoorden) {
      expect(r.status).toBe(423);
      const b = await lees(r);
      expect(b.error.code).toBe("ALLEEN_BEHEERDER");
      expect(b.error.message).toContain("beheerder");
    }
    expect(m.kv.size).toBe(0);
  });
});

describe("checklists beheren", () => {
  it("maakt een checklist, de taken krijgen een id, en de hash van een link komt nooit mee", async () => {
    const s = await maak();
    expect(s.taken).toHaveLength(2);
    expect(s.taken.every((t) => typeof t.id === "string")).toBe(true);
    const link1 = await lees(await link.POST(json("POST", "/x"), id(s.id)));
    expect(link1.pad).toMatch(/^\/checklist\/[A-Za-z0-9_-]{32}$/);
    expect(link1.sjabloon.linkActief).toBe(true);
    const overzicht = await lees(await lijst.GET(json("GET", "/api/werkgever/checklists")));
    expect(JSON.stringify(overzicht)).not.toContain("linkHash");
    expect(overzicht.sjablonen[0].linkActief).toBe(true);
    expect(m.audit).toHaveBeenCalled();
    expect(JSON.stringify(m.audit.mock.calls)).not.toContain(link1.pad.slice(-32));
  });
  it("een ongeldige checklist geeft 422 met een Nederlandse tekst", async () => {
    const res = await lijst.POST(json("POST", "/x", sjabloonBody({ taken: [] })));
    expect(res.status).toBe(422);
    expect((await lees(res)).error.message).toBe("Zet er minstens één taak in.");
    const veel = await lijst.POST(json("POST", "/x", sjabloonBody({ taken: Array.from({ length: 61 }, (_, i) => ({ tekst: `T${i}` })) })));
    expect(veel.status).toBe(422);
    expect((await lijst.POST(new Request("http://app:3000/x", { method: "POST", body: "geen json" }))).status).toBe(422);
  });
  it("aanpassen en archiveren; een onbekend of kapot id geeft 404", async () => {
    const s = await maak();
    const res = await een.PUT(json("PUT", "/x", sjabloonBody({ actief: false, taken: [{ id: s.taken[1]?.id, tekst: "Afval" }, { id: s.taken[0]?.id, tekst: "Vloer" }] })), id(s.id));
    const b = await lees(res);
    expect(b.sjabloon.actief).toBe(false);
    expect(b.sjabloon.taken.map((t: { tekst: string }) => t.tekst)).toEqual(["Afval", "Vloer"]);
    expect((await een.PUT(json("PUT", "/x", sjabloonBody()), id("bestaatniet"))).status).toBe(404);
    expect((await een.PUT(json("PUT", "/x", sjabloonBody()), id("constructor"))).status).toBe(404);
    expect((await een.PUT(json("PUT", "/x", sjabloonBody()), id("../x"))).status).toBe(404);
  });
  it("de link intrekken", async () => {
    const s = await maak();
    const l = await lees(await link.POST(json("POST", "/x"), id(s.id)));
    const sleutel = (l.pad as string).slice("/checklist/".length);
    expect(await sjabloonVanSleutel(sleutel)).not.toBeNull();
    const res = await link.DELETE(json("DELETE", "/x"), id(s.id));
    expect((await lees(res)).sjabloon.linkActief).toBe(false);
    expect(await sjabloonVanSleutel(sleutel)).toBeNull();
    expect((await link.POST(json("POST", "/x"), id("bestaatniet"))).status).toBe(404);
  });
  it("een te vaak bewaarde checklist geeft de melding van de begrenzing door", async () => {
    const { AppError } = await import("@/lib/errors");
    m.limiet.mockRejectedValueOnce(AppError.rateLimited("Te vaak."));
    expect((await lijst.POST(json("POST", "/x", sjabloonBody()))).status).toBe(429);
  });
});

describe("uitvoeringen en overzicht", () => {
  it("zelf invullen, een correctie, en het overzicht met gemist bovenaan", async () => {
    vi.setSystemTime(new Date("2026-11-09T08:00:00Z"));
    const s = await maak({ herhaling: { soort: "dagelijks" } });
    vi.setSystemTime(new Date("2026-11-12T10:00:00Z"));
    const ongeldig = await uitv.POST(json("POST", "/x", { sjabloonId: s.id, uitvoerder: "Piet", taken: [] }));
    expect(ongeldig.status).toBe(422);
    const goed = await uitv.POST(json("POST", "/x", { sjabloonId: s.id, uitvoerder: "Piet", taken: antwoorden(s) }));
    const eerste = (await lees(goed)).uitvoering;
    expect(eerste.bron).toBe("beheer");
    expect(eerste.compleet).toBe(true);
    const corr = await uitv.POST(json("POST", "/x", { sjabloonId: s.id, uitvoerder: "Marie", taken: antwoorden(s, false), correctieVan: eerste.id }));
    expect((await lees(corr)).uitvoering.correctieVan).toBe(eerste.id);
    expect((await uitv.POST(json("POST", "/x", { sjabloonId: s.id, uitvoerder: "M", taken: antwoorden(s), correctieVan: "kapot" }))).status).toBe(404);
    expect((await uitv.POST(json("POST", "/x", { sjabloonId: "bestaatniet", uitvoerder: "Piet", taken: antwoorden(s) }))).status).toBe(404);

    const o = await lees(await lijst.GET(json("GET", "/api/werkgever/checklists?van=2026-11-10&tot=2026-11-12")));
    expect(o.vandaag).toBe("2026-11-12");
    expect(o.overzicht.rijen.map((r: { dag: string; status: string }) => [r.dag, r.status])).toEqual([
      ["2026-11-10", "gemist"],
      ["2026-11-11", "gemist"],
      ["2026-11-12", "compleet"],
    ]);
    expect(o.overzicht.gemist.map((r: { dag: string }) => r.dag)).toEqual(["2026-11-11", "2026-11-10"]);
    expect(o.uitvoeringen).toHaveLength(2);
  });
  it("de periode is hooguit 31 dagen en begint standaard 6 dagen voor vandaag", async () => {
    const o = await lees(await lijst.GET(json("GET", "/api/werkgever/checklists?van=2026-01-01&tot=2026-12-31")));
    expect(o.van).toBe("2026-01-01");
    expect(o.tot).toBe("2026-01-31");
    const standaard = await lees(await lijst.GET(json("GET", "/api/werkgever/checklists")));
    expect([standaard.van, standaard.tot]).toEqual(["2026-11-06", "2026-11-12"]);
    const kapot = await lees(await lijst.GET(json("GET", "/api/werkgever/checklists?van=morgen&tot=ooit")));
    expect([kapot.van, kapot.tot]).toEqual(["2026-11-06", "2026-11-12"]);
  });
  it("de geschiedenis per checklist, nieuwste eerst", async () => {
    const a = await maak();
    const b = await maak({ naam: "Opening" });
    for (const t of ["2026-11-10T09:00:00Z", "2026-11-11T09:00:00Z"]) {
      vi.setSystemTime(new Date(t));
      await uitv.POST(json("POST", "/x", { sjabloonId: a.id, uitvoerder: "Piet", taken: antwoorden(a) }));
    }
    await uitv.POST(json("POST", "/x", { sjabloonId: b.id, uitvoerder: "Anna", taken: antwoorden(b) }));
    const alle = await lees(await uitv.GET(json("GET", "/x?tot=2026-11-12")));
    expect(alle.uitvoeringen).toHaveLength(3);
    const alleenA = await lees(await uitv.GET(json("GET", `/x?tot=2026-11-12&sjabloon=${a.id}`)));
    expect(alleenA.uitvoeringen.map((u: { tijdstip: string }) => u.tijdstip.slice(0, 10))).toEqual(["2026-11-11", "2026-11-10"]);
    expect((await uitv.GET(json("GET", "/x?sjabloon=kapot!"))).status).toBe(404);
    // een sleutel als "constructor" is een geldig id-formaat maar bestaat niet: leeg, geen fout en geen lek uit het prototype
    expect((await lees(await uitv.GET(json("GET", "/x?sjabloon=constructor")))).uitvoeringen).toEqual([]);
  });
  it("een uitvoering van een andere organisatie is niet te zien", async () => {
    m.kv.set("checklist:uitv:t9:2026-11-12~abcdef123456", { id: "2026-11-12~abcdef123456", sjabloonId: "x", tijdstip: "2026-11-12T09:00:00Z", uitvoerder: "Vreemd" });
    const o = await lees(await uitv.GET(json("GET", "/x?tot=2026-11-12")));
    expect(o.uitvoeringen).toEqual([]);
  });
});

describe("persoonsgegevens", () => {
  it("de namen en wissen: de naam wordt Verwijderd, het auditspoor bevat de naam niet", async () => {
    const s = await maak();
    await uitv.POST(json("POST", "/x", { sjabloonId: s.id, uitvoerder: "Piet Jansen", taken: antwoorden(s) }));
    expect((await lees(await uitvoerders.GET())).uitvoerders).toEqual([{ naam: "Piet Jansen", aantal: 1 }]);
    const res = await uitvoerders.DELETE(json("DELETE", "/x", { naam: "piet jansen" }));
    expect((await lees(res)).gewist).toBe(1);
    expect(JSON.stringify(m.audit.mock.calls)).not.toContain("Jansen");
    expect((await lees(await uitvoerders.GET())).uitvoerders).toEqual([]);
    expect(JSON.stringify([...m.kv])).not.toContain("Jansen");
  });
  it("zonder naam geeft wissen 422", async () => {
    expect((await uitvoerders.DELETE(json("DELETE", "/x", {}))).status).toBe(422);
  });
});
