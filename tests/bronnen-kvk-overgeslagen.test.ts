import { beforeEach, describe, expect, it, vi } from "vitest";

// De wekelijkse KVK-controle van bedrijven (lib/bronnen/haal.ts) bij een KVKBase-tegoed op nul (22 nov 2026): hij roept KVKBase
// niet aan, geldt als overgeslagen en niet als mislukt, en de eigenaar krijgt er geen melding "lukt niet meer" over.

const h = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  sleutel: true,
  bedrijven: [] as { id: string; name: string; kvkNumber: string }[],
  lookup: vi.fn(),
  alert: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ env: { APP_BASE_URL: "https://zf.test" } }));
vi.mock("@/lib/prisma", () => ({ prisma: { tenant: { findMany: async () => h.bedrijven }, shift: { count: async () => 0 } } }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (h.kv.has(k) ? h.kv.get(k) : null),
  kvGetMany: async (keys: string[]) => new Map(keys.filter((k) => h.kv.has(k)).map((k) => [k, h.kv.get(k)])),
  kvSet: async (k: string, v: unknown) => void h.kv.set(k, v),
  kvDelete: async (k: string) => void h.kv.delete(k),
  kvListEntries: async () => [],
  kvAppend: async (k: string, v: unknown) => void h.kv.set(k, [...((h.kv.get(k) as unknown[] | undefined) ?? []), v]),
}));
vi.mock("@/lib/website-check/fetch", () => ({ fetchPage: vi.fn() }));
vi.mock("@/lib/integrations/kvkbase", () => ({ isKvkBaseEnabled: () => h.sleutel, lookupCompany: (...a: unknown[]) => h.lookup(...a) }));
vi.mock("@/lib/bronnen/scraper", () => ({ schermafdruk: vi.fn(), scraperIngesteld: () => false }));
vi.mock("@/lib/metrics", () => ({ recordCronRun: vi.fn() }));
vi.mock("@/lib/ops/alert", () => ({ alertOwner: (...a: unknown[]) => h.alert(...a) }));

import { haalBron } from "@/lib/bronnen/haal";
import { isOvergeslagen, type Meting } from "@/lib/bronnen/catalogus";
import { aanDeBeurt, haalEnBewaar } from "@/lib/bronnen/tick";

const tegoed = (t: { tokens: number; op: boolean }) => h.kv.set("meting:kvkbase-tegoed", { tokens: t.tokens, perMinuut: 10, op: t.op, at: "2026-11-22T08:00:00.000Z" });

beforeEach(() => {
  h.kv.clear();
  h.sleutel = true;
  h.bedrijven = [
    { id: "t1", name: "Bakkerij Jansen", kvkNumber: "12345678" },
    { id: "t2", name: "Schildersbedrijf De Vries", kvkNumber: "87654321" },
  ];
  h.lookup.mockReset().mockResolvedValue({ isActive: true, insolvent: false });
  h.alert.mockReset();
});

describe("de KVK-controle van bedrijven zonder tegoed", () => {
  it("een tegoed op nul: KVKBase wordt niet aangeroepen en de meting is overgeslagen, niet mislukt", async () => {
    tegoed({ tokens: 0, op: true });
    const m = await haalBron("kvk");
    expect(h.lookup).not.toHaveBeenCalled();
    expect(m).toMatchObject({ ok: true, fout: "", waarden: { overgeslagen: 1 } });
    expect(m.tekst).toMatch(/^Overgeslagen: .*KVK-tegoed/);
    expect(isOvergeslagen(m)).toBe(true);
  });

  it("een nog nooit gemeten tegoed telt ook als overgeslagen", async () => {
    expect(isOvergeslagen(await haalBron("kvk"))).toBe(true);
    expect(h.lookup).not.toHaveBeenCalled();
  });

  it("vijf rondes na elkaar geven geen melding aan de eigenaar en tellen geen mislukkingen", async () => {
    tegoed({ tokens: 0, op: true });
    for (let i = 0; i < 5; i++) await haalEnBewaar("kvk");
    expect(h.alert).not.toHaveBeenCalled();
    expect(h.kv.get("bron:kvk:fouten")).toBe(0);
    // en de volgende ronde komt pas na het gewone ritme (een week), niet na een uur
    const laatste = h.kv.get("bron:kvk:laatste") as Meting;
    expect(aanDeBeurt("kvk", laatste, Date.parse(laatste.op) + 3 * 3_600_000)).toBe(false);
  });

  it("zonder KVKBase-sleutel meldt de planner ook niets: dat staat in Te doen en is geen storing", async () => {
    h.sleutel = false;
    for (let i = 0; i < 5; i++) await haalEnBewaar("kvk");
    expect(h.alert).not.toHaveBeenCalled();
  });

  it("met genoeg tegoed controleert hij de bedrijven zoals altijd", async () => {
    tegoed({ tokens: 1000, op: false });
    const m = await haalBron("kvk");
    expect(h.lookup).toHaveBeenCalledTimes(2);
    expect(m.ok).toBe(true);
    expect(isOvergeslagen(m)).toBe(false);
    expect(m.tekst).toContain("2 van 2 bedrijven actief");
  });
});
