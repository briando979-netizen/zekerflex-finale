import { beforeEach, describe, expect, it, vi } from "vitest";

// De route van de nachtelijke boekhoudronde en de aansluiting op de echte afhankelijkheden: met de vlag uit gebeurt er
// niets (en de hartslag telt dat als gelukt), er wordt nooit een administratie aangemaakt, en bank koppelen beoordeelt
// alleen NIEUWE transacties (twijfel blijft bij een mens).

const m = vi.hoisted(() => ({
  featureEnabled: vi.fn(),
  recordCronRun: vi.fn(),
  gate: vi.fn(),
  logError: vi.fn(),
  administraties: vi.fn(),
  administratieAanmaken: vi.fn(),
  verwerkNieuw: vi.fn(),
  boekOpen: vi.fn(),
  kv: new Map<string, unknown>(),
}));

vi.mock("@/lib/logger", () => ({ logger: { error: m.logError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/flags", () => ({ featureEnabled: m.featureEnabled }));
vi.mock("@/lib/metrics", () => ({ recordCronRun: m.recordCronRun }));
vi.mock("@/lib/internal-auth", () => ({ checkInternalToken: m.gate }));
vi.mock("@/lib/ops/alert", () => ({ alertOwner: vi.fn(async () => "sent") }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => m.kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void m.kv.set(k, v),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    boekAdministratie: { findMany: m.administraties, create: m.administratieAanmaken, upsert: m.administratieAanmaken },
    boekBoeking: { aggregate: vi.fn(async () => ({ _count: { _all: 0 }, _max: { createdAt: null } })) },
    boekBankTransactie: { count: vi.fn(async () => 0) },
    boekBon: { count: vi.fn(async () => 0) },
  },
}));
vi.mock("@/lib/boekhouding/inkomsten", () => ({ boekOpenFacturen: m.boekOpen }));
vi.mock("@/lib/boekhouding/bank/matching", () => ({ verwerkNieuweTransacties: m.verwerkNieuw }));
vi.mock("@/lib/boekhouding/btw/concept", () => ({ leesBtwConcept: vi.fn(async () => ({ laatste: null })), maakBtwConcept: vi.fn() }));

const route = await import("@/app/api/internal/boekhouding/nachtronde/route");

type Handler = (r: Request) => Promise<Response>;
const aanroep = () => (route.POST as Handler)(new Request("http://localhost/api/internal/boekhouding/nachtronde", { method: "POST" }));

beforeEach(() => {
  vi.clearAllMocks();
  m.kv.clear();
  m.gate.mockReturnValue({ ok: true });
  m.featureEnabled.mockResolvedValue(true);
  m.administraties.mockResolvedValue([{ id: "adm1" }]);
  m.boekOpen.mockResolvedValue({ nieuweFacturen: 0, nieuweBetalingen: 0, nieuweTegenboekingen: 0, alGeboekt: 0, fouten: [] });
  m.verwerkNieuw.mockResolvedValue({ bekeken: 0, geboekt: 0, gekoppeld: 0, evenKijken: 0, mislukt: 0 });
});

describe("route /api/internal/boekhouding/nachtronde", () => {
  it("weigert zonder interne sleutel en doet dan niets", async () => {
    m.gate.mockReturnValue({ ok: false, status: 401, message: "Bad internal token" });
    expect((await aanroep()).status).toBe(401);
    expect(m.featureEnabled).not.toHaveBeenCalled();
    expect(m.administraties).not.toHaveBeenCalled();
  });

  it("met de vlag uit: 200, niets aangeraakt, en de hartslag telt dat als gelukt", async () => {
    m.featureEnabled.mockResolvedValue(false);
    const res = await aanroep();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "uit" });
    expect(m.recordCronRun).toHaveBeenCalledWith("boekhouding-nachtronde", true);
    expect(m.administraties).not.toHaveBeenCalled();
    expect(m.boekOpen).not.toHaveBeenCalled();
    expect(m.verwerkNieuw).not.toHaveBeenCalled();
  });

  it("met de vlag aan: draait per echte administratie, nooit met een nieuwe administratie", async () => {
    const res = await aanroep();
    expect(res.status).toBe(200);
    expect(m.recordCronRun).toHaveBeenCalledWith("boekhouding-nachtronde", true);
    expect(m.boekOpen).toHaveBeenCalledTimes(1);
    expect(m.administraties.mock.calls[0]![0]).toMatchObject({ where: { soort: "ECHT", actief: true } });
    expect(m.administratieAanmaken).not.toHaveBeenCalled();
  });

  it("zonder echte administratie wordt er geen aangemaakt en loopt de ronde door", async () => {
    m.administraties.mockResolvedValue([]);
    const res = await aanroep();
    expect(res.status).toBe(200);
    expect(m.administratieAanmaken).not.toHaveBeenCalled();
    expect(m.boekOpen).not.toHaveBeenCalled();
  });

  it("bank koppelen beoordeelt alleen nieuwe transacties (twijfel blijft bij een mens)", async () => {
    await aanroep();
    expect(m.verwerkNieuw).toHaveBeenCalledWith("adm1", expect.objectContaining({ ookTwijfel: false, door: "systeem" }));
  });

  it("een mislukte stap geeft 500 en een mislukte hartslag, de rest van de ronde draait wel", async () => {
    m.boekOpen.mockRejectedValue(new Error("db weg"));
    const res = await aanroep();
    expect(res.status).toBe(500);
    expect(m.recordCronRun).toHaveBeenCalledWith("boekhouding-nachtronde", false);
    expect(m.verwerkNieuw).toHaveBeenCalledTimes(1);
  });

  it("een kapotte vlag-opslag geeft 500 en een regel in het foutenlogboek", async () => {
    m.featureEnabled.mockRejectedValue(new Error("kv weg"));
    const res = await aanroep();
    expect(res.status).toBe(500);
    expect(m.recordCronRun).toHaveBeenCalledWith("boekhouding-nachtronde", false);
    expect(m.logError).toHaveBeenCalled();
  });
});

describe("vlag", () => {
  it("de vlag staat standaard uit in het register", async () => {
    const { FLAG_REGISTRY } = await vi.importActual<typeof import("@/lib/flags")>("@/lib/flags");
    const vlag = FLAG_REGISTRY.find((f) => f.key === "boekhouding-nachtronde");
    expect(vlag?.default).toBe(false);
  });
});
