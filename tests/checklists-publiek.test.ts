import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ kv: new Map<string, unknown>(), limiet: vi.fn() }));

vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (m.kv.has(k) ? structuredClone(m.kv.get(k)) : null),
  kvSet: async (k: string, v: unknown) => void m.kv.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void m.kv.delete(k),
  kvListValues: async (p: string, limit: number) => [...m.kv].filter(([k]) => k.startsWith(p)).slice(0, limit).map(([, v]) => structuredClone(v)),
  kvListEntries: async (p: string, limit: number) => [...m.kv].filter(([k]) => k.startsWith(p)).slice(0, limit).map(([key, v]) => ({ key, value: structuredClone(v) })),
}));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: (...a: unknown[]) => m.limiet(...a) }));
vi.mock("@/lib/http/request", () => ({ clientIp: () => "203.0.113.7" }));

import * as publiek from "@/app/api/checklist/[sleutel]/route";
import { alleUitvoeringen, maakLink, maakSjabloon, trekLinkIn, wijzigSjabloon } from "@/lib/checklists/store";
import { AppError } from "@/lib/errors";

const req = (method: string, body?: unknown) => new Request("http://app:3000/api/checklist/x", { method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const sl = (s: string) => ({ params: Promise.resolve({ sleutel: s }) });
const lees = async (r: Response) => (await r.json()) as Record<string, any>;

let sleutel = "";
let taken: { id: string }[] = [];
let sjabloonId = "";

const invoer = (over = {}) => ({
  naam: "Sluitronde",
  locatie: "Keuken",
  taken: [
    { id: "t1", tekst: "Vloer", opmerkingVerplicht: false },
    { id: "t2", tekst: "Afval", opmerkingVerplicht: true },
  ],
  herhaling: { soort: "dagelijks" as const, dagen: [], uiterlijk: "07:00", volgendeDag: false },
  actief: true,
  ...over,
});
const body = (over: Record<string, unknown> = {}) => ({
  uitvoerder: "Piet",
  notitie: "",
  aanvraagId: "abcdef1234567890",
  website: "",
  taken: [{ id: "t1", gedaan: true }, { id: "t2", gedaan: true }],
  ...over,
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-12T05:00:00Z"));
  m.kv.clear();
  m.limiet.mockReset().mockResolvedValue(undefined);
  const s = await maakSjabloon("t1", invoer());
  sjabloonId = s.id;
  taken = s.taken;
  sleutel = (await maakLink("t1", s.id, "Schoonmaak Jansen")).sleutel;
});
afterEach(() => vi.useRealTimers());

describe("GET /api/checklist/<sleutel>", () => {
  it("geeft alleen de taken van dat ene sjabloon, zonder id's van de organisatie, uitvoeringen of namen", async () => {
    const other = await maakSjabloon("t1", invoer({ naam: "Geheim", taken: [{ id: "g1", tekst: "Geheime taak", opmerkingVerplicht: false }] }));
    await maakLink("t1", other.id, "x");
    const res = await publiek.GET(req("GET"), sl(sleutel));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const b = await lees(res);
    expect(Object.keys(b).sort()).toEqual(["bedrijfsnaam", "herhaling", "locatie", "naam", "taken"]);
    expect(b.bedrijfsnaam).toBe("Schoonmaak Jansen");
    expect(b.herhaling).toBe("Elke dag, uiterlijk 07:00");
    expect(b.taken).toEqual([
      { id: "t1", tekst: "Vloer", opmerkingVerplicht: false },
      { id: "t2", tekst: "Afval", opmerkingVerplicht: true },
    ]);
    expect(JSON.stringify(b)).not.toContain("Geheim");
  });
  it("een verkeerde, onbekende, ingetrokken of gearchiveerde sleutel geeft overal dezelfde 404", async () => {
    const onbekend = await publiek.GET(req("GET"), sl("A".repeat(32)));
    const kapot = await publiek.GET(req("GET"), sl("constructor"));
    await wijzigSjabloon("t1", sjabloonId, invoer({ actief: false }));
    const gearchiveerd = await publiek.GET(req("GET"), sl(sleutel));
    await wijzigSjabloon("t1", sjabloonId, invoer());
    await trekLinkIn("t1", sjabloonId);
    const ingetrokken = await publiek.GET(req("GET"), sl(sleutel));
    const teksten = await Promise.all([onbekend, kapot, gearchiveerd, ingetrokken].map(async (r) => [r.status, (await lees(r)).error.message]));
    expect(teksten.every(([s]) => s === 404)).toBe(true);
    expect(new Set(teksten.map(([, t]) => t)).size).toBe(1);
  });
  it("is IP-begrensd", async () => {
    m.limiet.mockRejectedValueOnce(AppError.rateLimited("Te vaak."));
    expect((await publiek.GET(req("GET"), sl(sleutel))).status).toBe(429);
    expect(m.limiet.mock.calls[0]?.[0]).toMatchObject({ name: "checklist-lezen", identifier: "203.0.113.7" });
  });
});

describe("POST /api/checklist/<sleutel>", () => {
  it("legt een uitvoering vast op de servertijd en geeft alleen de uitkomst terug", async () => {
    const res = await publiek.POST(req("POST", body({ notitie: "Rustige avond" })), sl(sleutel));
    expect(res.status).toBe(200);
    const b = await lees(res);
    expect(b.uitvoering).toEqual({ opgeslagen: true, dubbel: false, compleet: true, tijdstip: "2026-11-12T05:00:00.000Z", aantalTaken: 2, aantalGedaan: 2 });
    const [u] = await alleUitvoeringen("t1");
    expect(u).toMatchObject({ uitvoerder: "Piet", bron: "link", sjabloonId, notitie: "Rustige avond", compleet: true, correctieVan: null });
  });
  it("de tijd komt van de server, niet uit het verzoek", async () => {
    await publiek.POST(req("POST", body({ tijdstip: "2020-01-01T00:00:00Z" })), sl(sleutel));
    expect((await alleUitvoeringen("t1"))[0]?.tijdstip).toBe("2026-11-12T05:00:00.000Z");
  });
  it("een taak niet gedaan: niet compleet, en de opmerking is verplicht waar het sjabloon dat vraagt", async () => {
    const zonder = await publiek.POST(req("POST", body({ taken: [{ id: "t1", gedaan: true }, { id: "t2", gedaan: false }] })), sl(sleutel));
    expect(zonder.status).toBe(422);
    expect((await alleUitvoeringen("t1")).length).toBe(0);
    const met = await publiek.POST(req("POST", body({ taken: [{ id: "t1", gedaan: false }, { id: "t2", gedaan: false, opmerking: "Container vol" }] })), sl(sleutel));
    const b = await lees(met);
    expect([b.uitvoering.compleet, b.uitvoering.aantalGedaan]).toEqual([false, 0]);
  });
  it("een dubbele tik (zelfde aanvraag-id) maakt geen tweede uitvoering", async () => {
    const een = await lees(await publiek.POST(req("POST", body()), sl(sleutel)));
    const twee = await lees(await publiek.POST(req("POST", body()), sl(sleutel)));
    expect(een.uitvoering.dubbel).toBe(false);
    expect(twee.uitvoering.dubbel).toBe(true);
    expect(twee.uitvoering.tijdstip).toBe(een.uitvoering.tijdstip);
    expect((await alleUitvoeringen("t1")).length).toBe(1);
    const nieuw = await publiek.POST(req("POST", body({ aanvraagId: "nieuweaanvraag9999" })), sl(sleutel));
    expect((await lees(nieuw)).uitvoering.dubbel).toBe(false);
    expect((await alleUitvoeringen("t1")).length).toBe(2);
  });
  it("het verborgen botveld: doet alsof het gelukt is, bewaart niets", async () => {
    const res = await publiek.POST(req("POST", body({ website: "https://spam.example" })), sl(sleutel));
    expect(res.status).toBe(200);
    expect((await lees(res)).uitvoering).toEqual({ opgeslagen: true });
    expect((await alleUitvoeringen("t1")).length).toBe(0);
  });
  it("een naam is verplicht; een taak die niet bij de checklist hoort wordt geweigerd", async () => {
    expect((await publiek.POST(req("POST", body({ uitvoerder: "" })), sl(sleutel))).status).toBe(422);
    expect((await publiek.POST(req("POST", body({ taken: [{ id: "t1", gedaan: true }, { id: "t2", gedaan: true }, { id: "t9", gedaan: true }] })), sl(sleutel))).status).toBe(422);
    expect((await publiek.POST(req("POST", body({ aanvraagId: "x" })), sl(sleutel))).status).toBe(422);
    expect((await publiek.POST(new Request("http://app:3000/x", { method: "POST", body: "geen json" }), sl(sleutel))).status).toBe(422);
    expect((await alleUitvoeringen("t1")).length).toBe(0);
  });
  it("een foute of ingetrokken sleutel geeft 404 en bewaart niets", async () => {
    expect((await publiek.POST(req("POST", body()), sl("B".repeat(32)))).status).toBe(404);
    await trekLinkIn("t1", sjabloonId);
    expect((await publiek.POST(req("POST", body()), sl(sleutel))).status).toBe(404);
    expect((await alleUitvoeringen("t1")).length).toBe(0);
  });
  it("een gearchiveerde checklist neemt niets meer aan", async () => {
    await wijzigSjabloon("t1", sjabloonId, invoer({ actief: false }));
    expect((await publiek.POST(req("POST", body()), sl(sleutel))).status).toBe(404);
  });
  it("is begrensd per IP en per link, en een begrensd verzoek bewaart niets; de sleutel zelf wordt niet als sleutel van de begrenzing gebruikt", async () => {
    m.limiet.mockRejectedValueOnce(AppError.rateLimited("Te vaak."));
    expect((await publiek.POST(req("POST", body()), sl(sleutel))).status).toBe(429);
    expect((await alleUitvoeringen("t1")).length).toBe(0);
    m.limiet.mockReset().mockResolvedValueOnce(undefined).mockRejectedValueOnce(AppError.rateLimited("Te vaak."));
    expect((await publiek.POST(req("POST", body()), sl(sleutel))).status).toBe(429);
    const ids = m.limiet.mock.calls.map((c) => (c[0] as { identifier: string }).identifier);
    expect(ids).toContain("203.0.113.7");
    expect(ids.every((i) => !i.includes(sleutel))).toBe(true);
    expect((await alleUitvoeringen("t1")).length).toBe(0);
  });
  it("een sleutel van een andere organisatie geeft alleen zijn eigen checklist en schrijft in zijn eigen organisatie", async () => {
    const s2 = await maakSjabloon("t2", invoer({ taken: [{ id: "x1", tekst: "Andere taak", opmerkingVerplicht: false }] }));
    const k2 = (await maakLink("t2", s2.id, "Ander bedrijf")).sleutel;
    expect((await lees(await publiek.GET(req("GET"), sl(k2)))).bedrijfsnaam).toBe("Ander bedrijf");
    expect((await publiek.POST(req("POST", body()), sl(k2))).status).toBe(422); // taken van t1 passen niet
    await publiek.POST(req("POST", body({ taken: [{ id: "x1", gedaan: true }] })), sl(k2));
    expect((await alleUitvoeringen("t2")).length).toBe(1);
    expect((await alleUitvoeringen("t1")).length).toBe(0);
    expect(taken).toHaveLength(2);
  });
});
