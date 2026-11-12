import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isPublicApiRoute } from "@/lib/auth/public-routes";

// Beheer van de boekhouding door de platformbeheerder: administraties aanmaken, facturen boeken (rooktest), testadministratie wissen.

const m = vi.hoisted(() => ({
  boekAdministratie: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() },
  tenant: { findUnique: vi.fn() },
  maakAdministratie: vi.fn(),
  boekOpenFacturen: vi.fn(),
  wisTestAdministratie: vi.fn(),
  recordAudit: vi.fn(async () => undefined),
}));

vi.mock("@/lib/prisma", () => ({ prisma: { boekAdministratie: m.boekAdministratie, tenant: m.tenant } }));
vi.mock("@/lib/audit", () => ({ recordAudit: m.recordAudit }));
vi.mock("@/lib/boekhouding/administratie", () => ({ maakAdministratie: m.maakAdministratie }));
vi.mock("@/lib/boekhouding/inkomsten", () => ({ boekOpenFacturen: m.boekOpenFacturen }));
vi.mock("@/lib/boekhouding/test-wissen", () => ({ wisTestAdministratie: m.wisTestAdministratie }));
vi.mock("@/lib/auth/handlers", () => ({
  withAdminAccess: (_roles: string[], handler: (req: Request, ctx: { principal: { userId: string } }) => Promise<Response>) => async (req: Request) => {
    try {
      return await handler(req, { principal: { userId: "admin-1" } });
    } catch (e) {
      const f = e as { status?: number; code?: string; message: string; name: string };
      if (f.name === "ZodError") return Response.json({ code: "VALIDATION_FAILED" }, { status: 422 });
      return Response.json({ code: f.code, message: f.message }, { status: f.status ?? 500 });
    }
  },
}));

const adm = await import("@/app/api/admin/boekhouding/administraties/route");
const boek = await import("@/app/api/admin/boekhouding/boek-facturen/route");
const wis = await import("@/app/api/admin/boekhouding/wis-test/route");

type Handler = (r: Request) => Promise<Response>;
const post = (route: unknown, body: unknown, method = "POST") =>
  (route as Handler)(new Request("http://localhost/x", { method, body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  m.boekAdministratie.findFirst.mockResolvedValue(null);
  m.tenant.findUnique.mockResolvedValue({ id: "t1" });
  m.maakAdministratie.mockImplementation(async (i: { soort: string }) => ({ id: "a1", soort: i.soort, rekeningen: 10, btwCodes: 3 }));
});

describe("POST administraties", () => {
  it("een TEST-administratie krijgt het voorvoegsel TEST en mag een bestaande tenant hebben", async () => {
    const res = await post(adm.POST, { naam: "Rooktest", soort: "TEST", platformTenantId: "t1" });
    expect(res.status).toBe(201);
    expect(m.maakAdministratie).toHaveBeenCalledWith(expect.objectContaining({ naam: "TEST Rooktest", soort: "TEST", platformTenantId: "t1" }));
    expect((await res.json()).administratie.naam).toBe("TEST Rooktest");
  });

  it("een naam die al met TEST begint krijgt het voorvoegsel niet dubbel", async () => {
    await post(adm.POST, { naam: "test proef", soort: "TEST" });
    expect(m.maakAdministratie).toHaveBeenCalledWith(expect.objectContaining({ naam: "test proef" }));
  });

  it("ECHT zonder bevestiging wordt geweigerd", async () => {
    const res = await post(adm.POST, { naam: "Zekerflex, Inc.", soort: "ECHT", platformTenantId: "t1" });
    expect(res.status).toBe(422);
    expect(m.maakAdministratie).not.toHaveBeenCalled();
    const fout = await post(adm.POST, { naam: "Zekerflex, Inc.", soort: "ECHT", platformTenantId: "t1", bevestig: "ja" });
    expect(fout.status).toBe(422);
  });

  it("ECHT vraagt een platform-tenant die bestaat", async () => {
    const zonder = await post(adm.POST, { naam: "Zekerflex, Inc.", soort: "ECHT", bevestig: "ECHT AANMAKEN" });
    expect(zonder.status).toBe(422);
    m.tenant.findUnique.mockResolvedValue(null);
    const onbekend = await post(adm.POST, { naam: "Zekerflex, Inc.", soort: "ECHT", platformTenantId: "weg", bevestig: "ECHT AANMAKEN" });
    expect(onbekend.status).toBe(422);
    expect(m.maakAdministratie).not.toHaveBeenCalled();
  });

  it("ECHT met bevestiging wordt aangemaakt en in het auditspoor gezet zonder persoonsgegevens", async () => {
    const res = await post(adm.POST, { naam: "Zekerflex, Inc.", soort: "ECHT", platformTenantId: "t1", bevestig: "ECHT AANMAKEN" });
    expect(res.status).toBe(201);
    expect(m.maakAdministratie).toHaveBeenCalledWith(expect.objectContaining({ soort: "ECHT", naam: "Zekerflex, Inc." }));
    expect(m.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "boekhouding.administratie_aangemaakt", targetId: "a1" }));
    expect(JSON.stringify(m.recordAudit.mock.calls)).not.toMatch(/Zekerflex/);
  });

  it("geen tweede ECHTE administratie met dezelfde naam of tenant", async () => {
    m.boekAdministratie.findFirst.mockResolvedValueOnce({ id: "bestaand" });
    const res = await post(adm.POST, { naam: "Zekerflex, Inc.", soort: "ECHT", platformTenantId: "t1", bevestig: "ECHT AANMAKEN" });
    expect(res.status).toBe(409);
    expect(m.maakAdministratie).not.toHaveBeenCalled();
  });

  it("een tenant die al aan een administratie hangt geeft een duidelijke 409", async () => {
    m.boekAdministratie.findFirst.mockResolvedValueOnce({ soort: "TEST" });
    const res = await post(adm.POST, { naam: "Proef", soort: "TEST", platformTenantId: "t1" });
    expect(res.status).toBe(409);
    expect((await res.json()).message).toMatch(/wis die eerst/);
  });

  it("een ongeldige soort of lege naam komt niet bij de database", async () => {
    expect((await post(adm.POST, { naam: "x", soort: "constructor" })).status).toBe(422);
    expect((await post(adm.POST, { naam: "  ", soort: "TEST" })).status).toBe(422);
    expect(m.maakAdministratie).not.toHaveBeenCalled();
  });
});

describe("GET administraties", () => {
  it("geeft soort, aantal boekingen en vergrendelde maanden", async () => {
    m.boekAdministratie.findMany.mockResolvedValue([
      { id: "a1", soort: "TEST", naam: "TEST x", valuta: "EUR", actief: true, platformTenantId: "t1", _count: { boekingen: 4 }, perioden: [{ jaar: 2026, maand: 3 }] },
    ]);
    const res = await (adm.GET as unknown as Handler)(new Request("http://localhost/x"));
    expect(await res.json()).toEqual({
      administraties: [{ id: "a1", soort: "TEST", naam: "TEST x", valuta: "EUR", actief: true, heeftPlatformTenant: true, boekingen: 4, vergrendeldeMaanden: ["2026-03"] }],
    });
  });
});

describe("POST boek-facturen", () => {
  const uitkomst = {
    verwerkt: 3, nieuweFacturen: 1, nieuweBetalingen: 1, nieuweTegenboekingen: 0, alGeboekt: 1, overgeslagen: 0,
    fouten: [{ invoiceId: "inv1", nummer: "F-1", fout: "Rekening 8000 ontbreekt" }],
  };

  it("geeft de uitkomst zonder invoice-id's terug en begrenst de limiet op 200", async () => {
    m.boekOpenFacturen.mockResolvedValue(uitkomst);
    const res = await post(boek.POST, { administratieId: "a1", sinds: "2026-11-01T00:00:00Z", limiet: 50 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fouten).toEqual([{ nummer: "F-1", fout: "Rekening 8000 ontbreekt" }]);
    expect(JSON.stringify(body)).not.toMatch(/inv1/);
    expect(m.boekOpenFacturen).toHaveBeenCalledWith("a1", { limiet: 50, sinds: new Date("2026-11-01T00:00:00Z") });
    expect((await post(boek.POST, { administratieId: "a1", limiet: 201 })).status).toBe(422);
    expect((await post(boek.POST, { administratieId: "a1", sinds: "gisteren" })).status).toBe(422);
  });

  it("zonder limiet geldt 200", async () => {
    m.boekOpenFacturen.mockResolvedValue({ ...uitkomst, fouten: [] });
    await post(boek.POST, { administratieId: "a1" });
    expect(m.boekOpenFacturen).toHaveBeenCalledWith("a1", { limiet: 200 });
  });
});

describe("wis-test", () => {
  it("wist een TEST-administratie, via POST en via DELETE", async () => {
    m.boekAdministratie.findUnique.mockResolvedValue({ soort: "TEST" });
    m.wisTestAdministratie.mockResolvedValue({ administratieId: "a1", verwijderd: { BoekAdministratie: 1 } });
    expect((await post(wis.POST, { administratieId: "a1" })).status).toBe(200);
    expect((await post(wis.DELETE, { administratieId: "a1" }, "DELETE")).status).toBe(200);
    expect(m.wisTestAdministratie).toHaveBeenCalledTimes(2);
  });

  it("weigert een ECHTE administratie met 409 en een eigen code", async () => {
    m.boekAdministratie.findUnique.mockResolvedValue({ soort: "ECHT" });
    const res = await post(wis.POST, { administratieId: "a1" });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("ECHT_ONVERANDERLIJK");
    expect(body.message).toMatch(/nooit gewist/);
    expect(m.wisTestAdministratie).not.toHaveBeenCalled();
  });

  it("een onbekende administratie geeft 404", async () => {
    m.boekAdministratie.findUnique.mockResolvedValue(null);
    expect((await post(wis.POST, { administratieId: "weg" })).status).toBe(404);
  });
});

describe("toegang", () => {
  const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");
  it("elke route is strikt voor PLATFORM_ADMIN en staat niet in de openbare routes", () => {
    for (const f of ["administraties", "boek-facturen", "wis-test"]) {
      const src = lees(`app/api/admin/boekhouding/${f}/route.ts`);
      expect(src).toMatch(/withAdminAccess\(\["PLATFORM_ADMIN"\]/);
      expect(src).not.toMatch(/export (async )?function/);
    }
    for (const f of ["administraties", "boek-facturen", "wis-test"]) expect(isPublicApiRoute(`/api/admin/boekhouding/${f}`)).toBe(false);
  });
});
