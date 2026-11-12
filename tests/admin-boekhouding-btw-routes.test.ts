import { beforeEach, describe, expect, it, vi } from "vitest";

// De routes achter het tabblad Btw in Beheer: concept maken, klaar zetten, als ingediend markeren en CSV.

const m = vi.hoisted(() => ({
  recordAudit: vi.fn(async () => undefined),
  leesBtwConcept: vi.fn(),
  maakBtwConcept: vi.fn(),
  btwConceptOpId: vi.fn(),
  markeerKlaarVoorIndienen: vi.fn(),
  markeerIngediend: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({ recordAudit: m.recordAudit }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/boekhouding/btw/concept", () => ({
  leesBtwConcept: m.leesBtwConcept,
  maakBtwConcept: m.maakBtwConcept,
  btwConceptOpId: m.btwConceptOpId,
  markeerKlaarVoorIndienen: m.markeerKlaarVoorIndienen,
  markeerIngediend: m.markeerIngediend,
}));
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

const lijst = await import("@/app/api/admin/boekhouding/btw/route");
const detail = await import("@/app/api/admin/boekhouding/btw/[id]/route");
const csv = await import("@/app/api/admin/boekhouding/btw/[id]/csv/route");

type Handler = (r: Request, c?: { params: Promise<unknown> }) => Promise<Response>;
const ID = "cm0abcdefghij12345";
const ADMIN = "cm0adminabcdef12345";
const metId = (id = ID) => ({ params: Promise.resolve({ id }) });
const json = (route: unknown, methode: string, body: unknown, id?: string) =>
  (route as Handler)(new Request("http://localhost/x", { method: methode, body: JSON.stringify(body) }), metId(id));

const concept = {
  id: ID,
  jaar: 2026,
  kwartaal: 1,
  versie: 2,
  status: "BEREKEND",
  inhoud: {
    meldingen: [{ code: "X", ernst: "blokkeert" }],
    rubrieken: [{ rubriek: "1a", label: "Leveringen", grondslagEuro: 100, btwCents: 2100 }],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  m.maakBtwConcept.mockResolvedValue(concept);
  m.btwConceptOpId.mockResolvedValue(concept);
  m.leesBtwConcept.mockResolvedValue({ laatste: null, versies: 0, deadline: "2026-04-30" });
  m.markeerKlaarVoorIndienen.mockResolvedValue({ concept: { ...concept, status: "GOEDGEKEURD" }, overschreven: false });
  m.markeerIngediend.mockResolvedValue({ ...concept, status: "INGEDIEND" });
});

describe("/api/admin/boekhouding/btw", () => {
  it("GET leest het concept van een kwartaal", async () => {
    const res = await (lijst.GET as Handler)(new Request(`http://localhost/x?administratieId=${ADMIN}&jaar=2026&kwartaal=1`));
    expect(res.status).toBe(200);
    expect(m.leesBtwConcept).toHaveBeenCalledWith(ADMIN, 2026, 1);
  });

  it("GET zonder administratie geeft een 422", async () => {
    const res = await (lijst.GET as Handler)(new Request("http://localhost/x?jaar=2026&kwartaal=1"));
    expect(res.status).toBe(422);
    expect(m.leesBtwConcept).not.toHaveBeenCalled();
  });

  it("POST maakt een concept en legt alleen aantallen vast in het auditspoor", async () => {
    const res = await json(lijst.POST, "POST", { administratieId: ADMIN, jaar: 2026, kwartaal: 1 });
    expect(res.status).toBe(201);
    expect(m.maakBtwConcept).toHaveBeenCalledWith(ADMIN, 2026, 1);
    expect(m.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "boekhouding.btw_concept_gemaakt", metadata: { jaar: 2026, kwartaal: 1, versie: 2, blokkades: 1 } }));
  });

  it("POST met een kapotte body geeft een Nederlandse fout", async () => {
    const res = await (lijst.POST as Handler)(new Request("http://localhost/x", { method: "POST", body: "geen json" }));
    expect(res.status).toBe(422);
    expect(((await res.json()) as { message: string }).message).toContain("JSON-body");
  });
});

describe("/api/admin/boekhouding/btw/[id]", () => {
  it("PATCH klaar zet het concept klaar en meldt een overschrijving als waarschuwing", async () => {
    m.markeerKlaarVoorIndienen.mockResolvedValue({ concept: { ...concept, status: "GOEDGEKEURD" }, overschreven: true, reden: "Bevestigd door de accountant" });
    const res = await json(detail.PATCH, "PATCH", { actie: "klaar", overschrijfReden: "Bevestigd door de accountant" });
    expect(res.status).toBe(200);
    expect(m.markeerKlaarVoorIndienen).toHaveBeenCalledWith(ID, "admin-1", "Bevestigd door de accountant");
    expect(m.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "boekhouding.btw_concept_klaar", severity: "warning" }));
  });

  it("PATCH ingediend legt vast zonder de referentie in het auditspoor te zetten", async () => {
    const res = await json(detail.PATCH, "PATCH", { actie: "ingediend", ingediendOp: "2026-04-20", referentie: "ONTV-1" });
    expect(res.status).toBe(200);
    expect(m.markeerIngediend).toHaveBeenCalledWith(ID, { ingediendOp: "2026-04-20", referentie: "ONTV-1" });
    const audit = m.recordAudit.mock.calls[0] as unknown as [{ metadata: Record<string, unknown> }];
    expect(JSON.stringify(audit[0].metadata)).not.toContain("ONTV-1");
  });

  it("PATCH met een onbekende actie of een ongeldig id wordt geweigerd", async () => {
    expect((await json(detail.PATCH, "PATCH", { actie: "indienen" })).status).toBe(422);
    expect((await json(detail.PATCH, "PATCH", { actie: "klaar" }, "../constructor")).status).toBe(422);
    expect(m.markeerKlaarVoorIndienen).not.toHaveBeenCalled();
  });
});

describe("/api/admin/boekhouding/btw/[id]/csv", () => {
  it("geeft een CSV met bestandsnaam en geen persoonsgegevens", async () => {
    const res = await (csv.GET as Handler)(new Request("http://localhost/x"), metId());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toContain("btw-concept-2026-k1-v2.csv");
    const tekst = await res.text();
    expect(tekst).toContain("Rubriek;Omschrijving");
    expect(tekst).toContain("1a;Leveringen;100;21,00");
  });

  it("een ongeldig id geeft een 422", async () => {
    expect(((await (csv.GET as Handler)(new Request("http://localhost/x"), metId("../x"))).status)).toBe(422);
  });
});
