import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// De routes achter het scherm Beheer → Boekhouding: bonnen, goedkeuren en afkeuren, upload, bestand en afzenders.

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40)]);

const m = vi.hoisted(() => ({
  recordAudit: vi.fn(async () => undefined),
  keurBonGoed: vi.fn(),
  wijsBonAf: vi.fn(),
  ontvangBon: vi.fn(),
  boekBon: { findUnique: vi.fn() },
  bonRijOpId: vi.fn(),
  lijstBonnenEvenKijken: vi.fn(),
  bonBestandVoor: vi.fn(),
  overzichtGegevens: vi.fn(),
  leesEigenAfzenders: vi.fn(),
  schrijfEigenAfzenders: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({ recordAudit: m.recordAudit }));
vi.mock("@/lib/prisma", () => ({ prisma: { boekBon: m.boekBon } }));
vi.mock("@/lib/boekhouding/bonnen/bonnen", () => ({ keurBonGoed: m.keurBonGoed, wijsBonAf: m.wijsBonAf, ontvangBon: m.ontvangBon }));
vi.mock("@/lib/boekhouding/scherm", () => ({
  bonRijOpId: m.bonRijOpId,
  lijstBonnenEvenKijken: m.lijstBonnenEvenKijken,
  bonBestandVoor: m.bonBestandVoor,
  overzichtGegevens: m.overzichtGegevens,
  categorieKeuzes: () => [{ nummer: "4100", naam: "Software en abonnementen" }],
}));
vi.mock("@/lib/boekhouding/bonnen/afzenders", () => ({ leesEigenAfzenders: m.leesEigenAfzenders, schrijfEigenAfzenders: m.schrijfEigenAfzenders }));
vi.mock("@/lib/auth/handlers", () => ({
  withAdminAccess:
    (_roles: string[], handler: (req: Request, ctx: { principal: { userId: string }; params: unknown }) => Promise<Response>) =>
    async (req: Request, ctx?: { params?: Promise<unknown> }) => {
      try {
        return await handler(req, { principal: { userId: "admin-1" }, params: (await ctx?.params) ?? {} });
      } catch (e) {
        const f = e as { status?: number; code?: string; message: string; name: string };
        if (f.name === "ZodError") return Response.json({ code: "VALIDATION_FAILED", message: f.message }, { status: 422 });
        return Response.json({ code: f.code, message: f.message }, { status: f.status ?? 500 });
      }
    },
}));

const lijst = await import("@/app/api/admin/boekhouding/bonnen/route");
const detail = await import("@/app/api/admin/boekhouding/bonnen/[id]/route");
const bestand = await import("@/app/api/admin/boekhouding/bonnen/[id]/bestand/route");
const upload = await import("@/app/api/admin/boekhouding/bonnen/upload/route");
const afzenders = await import("@/app/api/admin/boekhouding/afzenders/route");
const overzicht = await import("@/app/api/admin/boekhouding/overzicht/route");

type Handler = (r: Request, c?: { params: Promise<unknown> }) => Promise<Response>;
const BON_ID = "cm0abcdefghij12345";
const metId = (id = BON_ID) => ({ params: Promise.resolve({ id }) });
const json = (route: unknown, methode: string, body: unknown, id?: string) =>
  (route as Handler)(new Request("http://localhost/x", { method: methode, body: JSON.stringify(body) }), metId(id));

const rij = { id: BON_ID, administratieId: "adm1", status: "GEBOEKT", leverancier: "Hetzner" };
const velden = { leverancier: "Hetzner", datum: "2026-11-01", totaal: "12,10", btwPercentage: 21, categorie: "4100" };

beforeEach(() => {
  vi.clearAllMocks();
  m.boekBon.findUnique.mockResolvedValue({ valuta: "EUR", administratie: { valuta: "EUR" } });
  m.keurBonGoed.mockResolvedValue({ boekstuk: "B-2026-1" });
  m.bonRijOpId.mockResolvedValue(rij);
});

describe("GET bonnen en overzicht", () => {
  it("geeft de bonnen bij even kijken met de categorieen", async () => {
    m.lijstBonnenEvenKijken.mockResolvedValue([{ id: "b1" }]);
    const res = await (lijst.GET as Handler)(new Request("http://localhost/api/admin/boekhouding/bonnen?administratieId=adm1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.bonnen).toEqual([{ id: "b1" }]);
    expect(body.categorieen[0].nummer).toBe("4100");
    expect(m.lijstBonnenEvenKijken).toHaveBeenCalledWith("adm1");
  });

  it("geeft het overzicht", async () => {
    m.overzichtGegevens.mockResolvedValue({ administraties: [], deadlines: [] });
    const res = await (overzicht.GET as Handler)(new Request("http://localhost/x"));
    expect(await res.json()).toEqual({ administraties: [], deadlines: [] });
  });
});

describe("PATCH bon", () => {
  it("goedkeuren: rekent de btw uit, boekt en geeft de serverversie terug", async () => {
    const res = await json(detail.PATCH, "PATCH", { actie: "goedkeuren", velden });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ bon: rij, boekstuk: "B-2026-1" });
    const [id, ruw, opties] = m.keurBonGoed.mock.calls[0]!;
    expect(id).toBe(BON_ID);
    expect(ruw).toMatchObject({ leverancier: "Hetzner", totaalCents: 1210, btwCents: 210, btwPercentage: 21, valuta: "EUR", categorie: "4100" });
    expect(opties).toMatchObject({ door: "admin-1" });
  });

  it("goedkeuren: audit zonder leverancier of bedrag", async () => {
    await json(detail.PATCH, "PATCH", { actie: "goedkeuren", velden });
    const audit = JSON.stringify(m.recordAudit.mock.calls);
    expect(audit).toContain("boekhouding.bon_goedgekeurd");
    expect(audit).not.toContain("Hetzner");
    expect(audit).not.toContain("1210");
  });

  it("goedkeuren: een bedrag dat geen bedrag is geeft een Nederlandse fout en boekt niet", async () => {
    const res = await json(detail.PATCH, "PATCH", { actie: "goedkeuren", velden: { ...velden, totaal: "veel" } });
    expect(res.status).toBe(422);
    expect(m.keurBonGoed).not.toHaveBeenCalled();
  });

  it("goedkeuren: een onbekend btw-tarief wordt geweigerd", async () => {
    const res = await json(detail.PATCH, "PATCH", { actie: "goedkeuren", velden: { ...velden, btwPercentage: 15 } });
    expect(res.status).toBe(422);
  });

  it("goedkeuren: stuurt ondanksDubbel door", async () => {
    await json(detail.PATCH, "PATCH", { actie: "goedkeuren", velden, ondanksDubbel: true });
    expect(m.keurBonGoed.mock.calls[0]![2]).toMatchObject({ ondanksDubbel: true });
  });

  it("afkeuren: vraagt een reden en geeft de serverversie terug", async () => {
    const zonder = await json(detail.PATCH, "PATCH", { actie: "afkeuren", reden: "" });
    expect(zonder.status).toBe(422);
    const res = await json(detail.PATCH, "PATCH", { actie: "afkeuren", reden: "Geen bon" });
    expect(res.status).toBe(200);
    expect(m.wijsBonAf).toHaveBeenCalledWith(BON_ID, "Geen bon", "admin-1");
    expect((await res.json()).bon).toEqual(rij);
    expect(JSON.stringify(m.recordAudit.mock.calls)).not.toContain("Geen bon");
  });

  it("een ongeldig id of een onbekende actie wordt geweigerd", async () => {
    expect((await json(detail.PATCH, "PATCH", { actie: "afkeuren", reden: "nee" }, "../etc")).status).toBe(422);
    expect((await json(detail.PATCH, "PATCH", { actie: "verwijderen" })).status).toBe(422);
  });
});

describe("GET bestand", () => {
  it("streamt het bestand met het juiste type en zonder caching", async () => {
    m.bonBestandVoor.mockResolvedValue({ bytes: PNG, mimeType: "image/png", extensie: "png" });
    const res = await (bestand.GET as Handler)(new Request("http://localhost/x"), metId());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("cache-control")).toContain("private");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await res.arrayBuffer()).equals(PNG)).toBe(true);
  });

  it("een ongeldig id komt nooit bij het bestandssysteem", async () => {
    const res = await (bestand.GET as Handler)(new Request("http://localhost/x"), metId("../../etc/passwd"));
    expect(res.status).toBe(422);
    expect(m.bonBestandVoor).not.toHaveBeenCalled();
  });
});

describe("POST upload", () => {
  const stuur = (form: FormData) => (upload.POST as Handler)(new Request("http://localhost/x", { method: "POST", body: form }));

  it("neemt een bon aan als de beheerder en geeft de bon terug", async () => {
    m.ontvangBon.mockResolvedValue({ bonId: BON_ID, status: "EVEN_KIJKEN", nieuw: true, redenen: ["twijfel"] });
    const form = new FormData();
    form.set("administratieId", "cm0adm1234567890");
    form.set("bestand", new File([PNG], "bon.png", { type: "image/png" }));
    const res = await stuur(form);
    expect(res.status).toBe(201);
    expect((await res.json()).bon).toEqual(rij);
    expect(m.ontvangBon).toHaveBeenCalledWith(expect.objectContaining({ administratieId: "cm0adm1234567890", geuploadDoor: "admin-1", herkomst: { bron: "upload", beheerder: true } }));
    expect(JSON.stringify(m.recordAudit.mock.calls)).not.toContain("bon.png");
  });

  it("zonder administratie of zonder bestand een duidelijke fout", async () => {
    const a = new FormData();
    a.set("bestand", new File([PNG], "bon.png"));
    expect((await stuur(a)).status).toBe(422);
    const b = new FormData();
    b.set("administratieId", "cm0adm1234567890");
    expect((await stuur(b)).status).toBe(422);
    expect(m.ontvangBon).not.toHaveBeenCalled();
  });

  it("een bestand boven 15 MB wordt geweigerd voor het gelezen wordt", async () => {
    const form = new FormData();
    form.set("administratieId", "cm0adm1234567890");
    form.set("bestand", new File([new Uint8Array(15 * 1024 * 1024 + 1)], "groot.pdf"));
    const res = await stuur(form);
    expect(res.status).toBe(422);
    expect(m.ontvangBon).not.toHaveBeenCalled();
  });
});

describe("afzenders", () => {
  it("GET geeft de lijst", async () => {
    m.leesEigenAfzenders.mockResolvedValue(["@hetzner.com"]);
    const res = await (afzenders.GET as Handler)(new Request("http://localhost/x"));
    expect(await res.json()).toEqual({ afzenders: ["@hetzner.com"] });
  });

  it("PUT bewaart en geeft de serverversie terug; audit alleen met het aantal", async () => {
    m.schrijfEigenAfzenders.mockResolvedValue(["factuur@hetzner.com"]);
    const res = await json(afzenders.PUT, "PUT", { afzenders: ["Factuur@Hetzner.com"] });
    expect(await res.json()).toEqual({ afzenders: ["factuur@hetzner.com"] });
    const audit = JSON.stringify(m.recordAudit.mock.calls);
    expect(audit).toContain('"aantal":1');
    expect(audit).not.toContain("hetzner");
  });

  it("PUT geeft de Nederlandse fout van de controle door", async () => {
    m.schrijfEigenAfzenders.mockRejectedValue(Object.assign(new Error("Een eigen afzender is een e-mailadres"), { status: 422, code: "VALIDATION_FAILED" }));
    const res = await json(afzenders.PUT, "PUT", { afzenders: ["geen adres"] });
    expect(res.status).toBe(422);
    expect(m.recordAudit).not.toHaveBeenCalled();
  });
});

describe("toegang", () => {
  it("elke nieuwe route is strikt voor platformbeheerders", () => {
    const root = path.join(process.cwd(), "app", "api", "admin", "boekhouding");
    for (const rel of ["bonnen/route.ts", "bonnen/[id]/route.ts", "bonnen/[id]/bestand/route.ts", "bonnen/upload/route.ts", "afzenders/route.ts", "overzicht/route.ts"]) {
      const src = readFileSync(path.join(root, rel), "utf8");
      expect(src, rel).toMatch(/withAdminAccess(<[^(]*>)?\(\["PLATFORM_ADMIN"\]/);
    }
  });
});
