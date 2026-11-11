import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  admin: true,
  ingelogd: true,
  tenant: "t1",
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
vi.mock("@/lib/dashboard/employer", () => ({ resolveEmployerScope: async () => ({ tenantIds: [m.tenant] }) }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: (...a: unknown[]) => m.limiet(...a) }));
vi.mock("@/lib/audit", () => ({ recordAudit: (...a: unknown[]) => m.audit(...a) }));

import * as lijst from "@/app/api/werkgever/werkbonnen/route";
import * as een from "@/app/api/werkgever/werkbonnen/[id]/route";
import * as wis from "@/app/api/werkgever/werkbonnen/[id]/wis-klant/route";
import * as team from "@/app/api/werkgever/werkbonnen/team/route";

const url = (p: string) => `http://app:3000${p}`;
const json = (method: string, p: string, body?: unknown) => new Request(url(p), { method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const id = (s: string) => ({ params: Promise.resolve({ id: s }) });
const lees = async (r: Response) => (await r.json()) as Record<string, any>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-12T06:00:00Z"));
  m.kv.clear();
  m.admin = true;
  m.ingelogd = true;
  m.tenant = "t1";
  m.limiet.mockReset().mockResolvedValue(undefined);
  m.audit.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

const body = (over: Record<string, unknown> = {}) => ({ omschrijving: "Dakgoot vervangen", klant: { naam: "Piet Jansen", email: "piet@voorbeeld.nl", plaats: "Utrecht" }, ...over });
const maak = async (over: Record<string, unknown> = {}) => (await lees(await lijst.POST(json("POST", "/api/werkgever/werkbonnen", body(over))))).bon as Record<string, any>;

describe("toegang", () => {
  it("een lid zonder beheerdersrol krijgt 423 met een eigen code, nergens 403", async () => {
    m.admin = false;
    const antwoorden = [
      await lijst.GET(json("GET", "/api/werkgever/werkbonnen")),
      await lijst.POST(json("POST", "/api/werkgever/werkbonnen", body())),
      await een.GET(json("GET", "/x"), id("2026-0001")),
      await een.PUT(json("PUT", "/x", body()), id("2026-0001")),
      await een.PATCH(json("PATCH", "/x", { status: "bezig" }), id("2026-0001")),
      await een.DELETE(json("DELETE", "/x"), id("2026-0001")),
      await wis.POST(json("POST", "/x"), id("2026-0001")),
      await team.PUT(json("PUT", "/x", { namen: [] })),
    ];
    for (const r of antwoorden) {
      expect(r.status).toBe(423);
      const b = await lees(r);
      expect(b.error.code).toBe("ALLEEN_BEHEERDER");
      expect(b.error.message).toMatch(/beheerder/);
    }
  });

  it("zonder login is het 401", async () => {
    m.ingelogd = false;
    expect((await lijst.GET(json("GET", "/api/werkgever/werkbonnen"))).status).toBe(401);
  });
});

describe("maken en lezen", () => {
  it("maakt een werkbon met nummer, status nieuw en totalen", async () => {
    const res = await lijst.POST(json("POST", "/api/werkgever/werkbonnen", body({ start: "2026-11-13T08:00", eind: "2026-11-13T12:00" })));
    expect(res.status).toBe(201);
    const b = await lees(res);
    expect(b.bon).toMatchObject({ nummer: "WB-2026-0001", status: "nieuw", start: "2026-11-13T07:00:00.000Z", eind: "2026-11-13T11:00:00.000Z" });
    expect(b.totalen).toMatchObject({ uren: 0, materiaalCent: 0 });
    expect((await maak()).nummer).toBe("WB-2026-0002");
  });

  it("geeft een Nederlandse 422 bij ongeldige invoer en maakt dan niets", async () => {
    const res = await lijst.POST(json("POST", "/api/werkgever/werkbonnen", body({ start: "2026-11-13T12:00", eind: "2026-11-13T08:00" })));
    expect(res.status).toBe(422);
    expect((await lees(res)).error.message).toMatch(/einde ligt voor het begin/i);
    expect((await lees(await lijst.POST(json("POST", "/api/werkgever/werkbonnen", { omschrijving: "" })))).error.message).toMatch(/omschrijving/);
    expect(await (await lees(await lijst.GET(json("GET", "/api/werkgever/werkbonnen")))).totaal).toBe(0);
  });

  it("een kapotte body geeft 422, geen 500", async () => {
    const res = await lijst.POST(new Request(url("/api/werkgever/werkbonnen"), { method: "POST", body: "{kapot" }));
    expect(res.status).toBe(422);
  });

  it("de lijst geeft regels met totalen, aantallen per status en de medewerkers; filter en zoeken werken", async () => {
    const a = await maak({ klant: { naam: "Jansen" }, uren: [{ medewerker: "Piet", datum: "2026-11-12", minuten: 90 }], materialen: [{ omschrijving: "Tegels", aantal: 2, prijsCent: 1000 }] });
    await maak({ klant: { naam: "De Vries", plaats: "Breda" } });
    await een.PATCH(json("PATCH", "/x", { status: "bezig" }), id(a.id));
    await team.PUT(json("PUT", "/x", { namen: ["Piet", "Klaas"] }));
    const alle = await lees(await lijst.GET(json("GET", "/api/werkgever/werkbonnen")));
    expect(alle.bonnen.map((b: any) => b.nummer)).toEqual(["WB-2026-0002", "WB-2026-0001"]);
    expect(alle.aantallen).toMatchObject({ nieuw: 1, bezig: 1, afgerond: 0 });
    expect(alle.team).toEqual(["Piet", "Klaas"]);
    const bezig = await lees(await lijst.GET(json("GET", "/api/werkgever/werkbonnen?status=bezig")));
    expect(bezig.bonnen).toHaveLength(1);
    expect(bezig.bonnen[0].totalen).toMatchObject({ uren: 1.5, materiaalCent: 2000 });
    expect(bezig.aantallen.nieuw).toBe(1); // de aantallen negeren het filter
    expect((await lees(await lijst.GET(json("GET", "/api/werkgever/werkbonnen?q=breda")))).bonnen).toHaveLength(1);
    expect((await lijst.GET(json("GET", "/api/werkgever/werkbonnen?status=constructor"))).status).toBe(422);
  });

  it("een andere organisatie ziet de werkbonnen niet en kan ze niet wijzigen", async () => {
    const a = await maak();
    m.tenant = "t2";
    expect((await lees(await lijst.GET(json("GET", "/api/werkgever/werkbonnen")))).totaal).toBe(0);
    expect((await een.GET(json("GET", "/x"), id(a.id))).status).toBe(404);
    expect((await een.PUT(json("PUT", "/x", body()), id(a.id))).status).toBe(404);
    expect((await een.PATCH(json("PATCH", "/x", { status: "bezig" }), id(a.id))).status).toBe(404);
    expect((await een.DELETE(json("DELETE", "/x"), id(a.id))).status).toBe(404);
    expect((await wis.POST(json("POST", "/x"), id(a.id))).status).toBe(404);
    m.tenant = "t1";
    const nog = await lees(await een.GET(json("GET", "/x"), id(a.id)));
    expect(nog.bon.klant.naam).toBe("Piet Jansen");
  });

  it("ongeldige id's geven 404 en raken de opslag niet", async () => {
    for (const s of ["constructor", "__proto__", "x", "2026-1", "../t2", "2026-0001%2F.."]) {
      expect((await een.GET(json("GET", "/x"), id(s))).status).toBe(404);
      expect((await een.PUT(json("PUT", "/x", body()), id(s))).status).toBe(404);
      expect((await een.PATCH(json("PATCH", "/x", { status: "bezig" }), id(s))).status).toBe(404);
      expect((await een.DELETE(json("DELETE", "/x"), id(s))).status).toBe(404);
      expect((await wis.POST(json("POST", "/x"), id(s))).status).toBe(404);
    }
    expect([...m.kv.keys()]).toEqual([]);
  });
});

describe("opslaan en status", () => {
  it("PUT bewaart de velden; uren en materialen komen terug met totalen; de status blijft", async () => {
    const a = await maak();
    const res = await een.PUT(
      json("PUT", "/x", body({ uren: [{ medewerker: "Piet", datum: "2026-11-12", minuten: 150 }], materialen: [{ omschrijving: "Goot", aantal: 3, prijsCent: 1250 }, { omschrijving: "Haken", aantal: 6 }] })),
      id(a.id),
    );
    expect(res.status).toBe(200);
    const b = await lees(res);
    expect(b.bon.status).toBe("nieuw");
    expect(b.totalen).toMatchObject({ uren: 2.5, materiaalCent: 3750, regelsZonderPrijs: 1 });
  });

  it("PUT met een fout geeft 422 en laat de bon zoals hij was", async () => {
    const a = await maak();
    const res = await een.PUT(json("PUT", "/x", body({ uren: [{ medewerker: "Piet", datum: "2026-11-12", minuten: 5000 }] })), id(a.id));
    expect(res.status).toBe(422);
    expect((await lees(await een.GET(json("GET", "/x"), id(a.id)))).bon.uren).toEqual([]);
  });

  it("PATCH volgt de toegestane overgangen en weigert de rest met 422", async () => {
    const a = await maak({ uren: [{ medewerker: "Piet", datum: "2026-11-12", minuten: 60 }] });
    expect((await lees(await een.PATCH(json("PATCH", "/x", { status: "ingepland" }), id(a.id)))).bon.status).toBe("ingepland");
    const af = await lees(await een.PATCH(json("PATCH", "/x", { status: "afgerond" }), id(a.id)));
    expect(af.bon).toMatchObject({ status: "afgerond", afgerondOp: "2026-11-12T06:00:00.000Z" });
    const nieuw = await een.PATCH(json("PATCH", "/x", { status: "nieuw" }), id(a.id));
    expect(nieuw.status).toBe(422);
    expect((await lees(nieuw)).error.message).toMatch(/kan niet naar/);
    expect((await een.PATCH(json("PATCH", "/x", { status: "bezig" }), id(a.id))).status).toBe(200);
    expect((await een.PATCH(json("PATCH", "/x", { status: "bestaat-niet" }), id(a.id))).status).toBe(422);
    expect((await een.PATCH(json("PATCH", "/x", {}), id(a.id))).status).toBe(422);
  });

  it("afronden zonder uren of materiaal vraagt om bevestiging met zonderUren: true", async () => {
    const a = await maak();
    await een.PATCH(json("PATCH", "/x", { status: "bezig" }), id(a.id));
    const weigert = await een.PATCH(json("PATCH", "/x", { status: "afgerond" }), id(a.id));
    expect(weigert.status).toBe(422);
    expect((await lees(weigert)).error.details).toEqual({ code: "ZONDER_UREN" });
    expect((await een.PATCH(json("PATCH", "/x", { status: "afgerond", zonderUren: "ja" }), id(a.id))).status).toBe(422);
    const ok = await een.PATCH(json("PATCH", "/x", { status: "afgerond", zonderUren: true }), id(a.id));
    expect(ok.status).toBe(200);
  });
});

describe("verwijderen en klantgegevens wissen", () => {
  it("verwijderen mag alleen bij nieuw of geannuleerd (anders 409) en komt in het auditspoor zonder persoonsgegevens", async () => {
    const a = await maak();
    await een.PATCH(json("PATCH", "/x", { status: "bezig" }), id(a.id));
    expect((await een.DELETE(json("DELETE", "/x"), id(a.id))).status).toBe(409);
    await een.PATCH(json("PATCH", "/x", { status: "geannuleerd" }), id(a.id));
    expect((await een.DELETE(json("DELETE", "/x"), id(a.id))).status).toBe(200);
    expect((await een.GET(json("GET", "/x"), id(a.id))).status).toBe(404);
    expect(m.audit).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(m.audit.mock.calls)).not.toMatch(/Piet|voorbeeld|Utrecht/);
  });

  it("klantgegevens wissen leegt de klant, laat de bon staan en logt geen persoonsgegevens", async () => {
    const a = await maak({ uren: [{ medewerker: "Piet", datum: "2026-11-12", minuten: 60 }] });
    const res = await wis.POST(json("POST", "/x"), id(a.id));
    expect(res.status).toBe(200);
    const b = await lees(res);
    expect(b.bon.klant).toEqual({ naam: "", telefoon: "", email: "", straat: "", huisnummer: "", postcode: "", plaats: "" });
    expect(b.bon.uren).toHaveLength(1);
    expect(b.bon.omschrijving).toBe("Dakgoot vervangen");
    expect(JSON.stringify([...m.kv.values()])).not.toContain("piet@voorbeeld.nl");
    expect(JSON.stringify(m.audit.mock.calls)).not.toMatch(/Piet|voorbeeld|Utrecht/);
  });
});

describe("medewerkerslijst", () => {
  it("bewaart schone namen en weigert meer dan 50", async () => {
    const ok = await lees(await team.PUT(json("PUT", "/x", { namen: [" Piet ", "Piet", "Klaas"] })));
    expect(ok.team).toEqual(["Piet", "Klaas"]);
    const teVeel = await team.PUT(json("PUT", "/x", { namen: Array.from({ length: 51 }, (_, n) => `M${n}`) }));
    expect(teVeel.status).toBe(422);
    expect((await team.PUT(json("PUT", "/x", {}))).status).toBe(422);
  });
});

describe("schrijfbegrenzing", () => {
  it("past de rate limit toe op schrijven en geeft de 429 door", async () => {
    const { AppError } = await import("@/lib/errors");
    m.limiet.mockRejectedValueOnce(AppError.rateLimited("Te vaak."));
    const res = await lijst.POST(json("POST", "/api/werkgever/werkbonnen", body()));
    expect(res.status).toBe(429);
    expect(m.kv.size).toBe(0);
  });
});
