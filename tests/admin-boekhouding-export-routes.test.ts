import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { kolommenbalans, winstVerlies, type ExportRekening } from "@/lib/boekhouding/export/kern";

// De route achter het tabblad "Voor de accountant": alle formaten, de controle en wat er NIET mag.

const m = vi.hoisted(() => ({
  recordAudit: vi.fn(async () => undefined),
  leesExport: vi.fn(),
  leesXaf: vi.fn(),
  leesExportControle: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({ recordAudit: m.recordAudit }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/boekhouding/export/export", () => ({ leesExport: m.leesExport, leesXaf: m.leesXaf, leesExportControle: m.leesExportControle }));
vi.mock("@/lib/auth/handlers", () => ({
  withAdminAccess:
    (_roles: string[], handler: (req: Request, ctx: { principal: { userId: string }; params: unknown }) => Promise<Response>) =>
    async (req: Request) => {
      try {
        return await handler(req, { principal: { userId: "admin-1" }, params: {} });
      } catch (e) {
        const f = e as { status?: number; code?: string; message: string; name: string };
        if (f.name === "ZodError") return Response.json({ code: "VALIDATION_FAILED", message: JSON.stringify((e as { issues: unknown }).issues) }, { status: 422 });
        return Response.json({ code: f.code, message: f.message }, { status: f.status ?? 500 });
      }
    },
}));

const route = await import("@/app/api/admin/boekhouding/export/route");
type Handler = (r: Request) => Promise<Response>;
const ADMIN = "cm0adminabcdef12345";
const haal = (q: string) => (route.GET as unknown as Handler)(new Request(`http://localhost/api/admin/boekhouding/export?${q}`));

const REKENINGEN: ExportRekening[] = [
  { nummer: "1000", naam: "Bank", soort: "ACTIVA" },
  { nummer: "8000", naam: "Omzet", soort: "OMZET" },
];
const sommen = [
  { rekeningNummer: "1000", debetCents: 12_100, creditCents: 0 },
  { rekeningNummer: "8000", debetCents: 0, creditCents: 12_100 },
];
const periode = { jaar: 2026, van: "2026-01-01", tot: "2026-12-31", boekjaarStart: "2026-01-01", boekjaarEinde: "2026-12-31", heelBoekjaar: true };
const gegevens = (soort: "ECHT" | "TEST" = "ECHT") => ({
  administratie: { id: ADMIN, naam: "Zekerflex, Inc.", soort, valuta: "EUR" },
  periode,
  kolommen: kolommenbalans({ valuta: "EUR", van: periode.van, tot: periode.tot, rekeningen: REKENINGEN, openingSommen: [], mutatieSommen: sommen }),
  wv: winstVerlies({ valuta: "EUR", van: periode.van, tot: periode.tot, rekeningen: REKENINGEN, mutatieSommen: sommen }),
});

beforeEach(() => {
  vi.clearAllMocks();
  m.leesExport.mockResolvedValue(gegevens());
  m.leesXaf.mockResolvedValue({ xaf: { xml: "<?xml version=\"1.0\"?><auditfile/>" }, periode, soort: "ECHT" });
  m.leesExportControle.mockResolvedValue({ periode, administratie: { naam: "X", soort: "ECHT", valuta: "EUR" }, meldingen: [], inBalans: true, boekingAantal: 1 });
});

describe("GET /api/admin/boekhouding/export", () => {
  it("geeft de auditfile als bijlage met een nette naam, zonder cache", async () => {
    const res = await haal(`administratieId=${ADMIN}&formaat=xaf&jaar=2026`);
    expect(res.status).toBe(200);
    expect(m.leesXaf).toHaveBeenCalledWith(ADMIN, 2026);
    expect(res.headers.get("Content-Type")).toContain("application/xml");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="auditfile-2026-01-01-2026-12-31.xaf"');
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await res.text()).toContain("<auditfile/>");
  });

  it("geeft de kolommenbalans en W&V als CSV", async () => {
    const kb = await haal(`administratieId=${ADMIN}&formaat=kolommenbalans-csv&jaar=2026`);
    expect(kb.headers.get("Content-Type")).toContain("text/csv");
    expect(kb.headers.get("Content-Disposition")).toContain("kolommenbalans-2026-01-01-2026-12-31.csv");
    expect(await kb.text()).toContain("1000;Bank;Activa");
    const wv = await haal(`administratieId=${ADMIN}&formaat=wv-csv&jaar=2026`);
    expect(wv.headers.get("Content-Disposition")).toContain("winst-en-verlies-2026-01-01-2026-12-31.csv");
    expect(await wv.text()).toContain("Resultaat;;Winst;121,00");
  });

  it("de printbare pagina heeft een strakke CSP en staat inline", async () => {
    const res = await haal(`administratieId=${ADMIN}&formaat=kolommenbalans-html&jaar=2026`);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    expect(res.headers.get("Content-Disposition")).toContain("inline");
    expect(res.headers.get("Content-Security-Policy")).toContain("default-src 'none'");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(await res.text()).toContain("Kolommenbalans");
    const wv = await haal(`administratieId=${ADMIN}&formaat=wv-html&jaar=2026`);
    expect(await wv.text()).toContain("Winst- en verliesrekening");
  });

  it("alles-zip bevat de auditfile en beide CSV-bestanden bij een heel boekjaar", async () => {
    const res = await haal(`administratieId=${ADMIN}&formaat=alles-zip&jaar=2026`);
    expect(res.headers.get("Content-Type")).toBe("application/zip");
    const bytes = new Uint8Array(await res.arrayBuffer());
    const tekst = new TextDecoder().decode(bytes);
    expect(bytes[0]).toBe(0x50);
    expect(tekst).toContain("auditfile-2026-01-01-2026-12-31.xaf");
    expect(tekst).toContain("kolommenbalans-2026-01-01-2026-12-31.csv");
    expect(tekst).toContain("winst-en-verlies-2026-01-01-2026-12-31.csv");
  });

  it("alles-zip van een eigen periode laat de auditfile weg", async () => {
    m.leesExport.mockResolvedValue({ ...gegevens(), periode: { ...periode, van: "2026-04-01", tot: "2026-06-30", heelBoekjaar: false } });
    const res = await haal(`administratieId=${ADMIN}&formaat=alles-zip&van=2026-04-01&tot=2026-06-30`);
    expect(res.status).toBe(200);
    expect(new TextDecoder().decode(new Uint8Array(await res.arrayBuffer()))).not.toContain(".xaf");
    expect(m.leesXaf).not.toHaveBeenCalled();
  });

  it("een testadministratie krijgt -test in de bestandsnaam", async () => {
    m.leesExport.mockResolvedValue(gegevens("TEST"));
    const res = await haal(`administratieId=${ADMIN}&formaat=wv-csv&jaar=2026`);
    expect(res.headers.get("Content-Disposition")).toContain("-test.csv");
  });

  it("de bestandsnaam bevat nooit de naam van de administratie", async () => {
    for (const f of ["xaf", "kolommenbalans-csv", "wv-csv", "kolommenbalans-html", "alles-zip"]) {
      const res = await haal(`administratieId=${ADMIN}&formaat=${f}&jaar=2026`);
      expect(res.headers.get("Content-Disposition")?.toLowerCase()).not.toContain("zekerflex");
    }
  });

  it("het audit-spoor bevat alleen formaat en periode, geen inhoud of namen", async () => {
    await haal(`administratieId=${ADMIN}&formaat=xaf&jaar=2026`);
    expect(m.recordAudit).toHaveBeenCalledTimes(1);
    const arg = (m.recordAudit.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(arg).toMatchObject({ action: "boekhouding.export", targetId: ADMIN, metadata: { formaat: "xaf", jaar: 2026 } });
    expect(JSON.stringify(arg)).not.toContain("Zekerflex");
  });

  it("de controle is JSON, niet in de cache en schrijft geen auditregel", async () => {
    const res = await haal(`administratieId=${ADMIN}&formaat=controle&jaar=2026`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(((await res.json()) as { inBalans: boolean }).inBalans).toBe(true);
    expect(m.leesExportControle).toHaveBeenCalledWith(ADMIN, { jaar: 2026, van: undefined, tot: undefined });
    expect(m.recordAudit).not.toHaveBeenCalled();
  });

  it("weigert een ongeldig formaat, een ongeldig id of een kapotte datum met een 422", async () => {
    expect((await haal(`administratieId=${ADMIN}&formaat=pdf&jaar=2026`)).status).toBe(422);
    expect((await haal(`administratieId=${ADMIN}&jaar=2026`)).status).toBe(422);
    expect((await haal(`administratieId=../constructor&formaat=xaf&jaar=2026`)).status).toBe(422);
    expect((await haal(`administratieId=${ADMIN}&formaat=wv-csv&van=morgen&tot=2026-12-31`)).status).toBe(422);
    expect(m.leesExport).not.toHaveBeenCalled();
    expect(m.recordAudit).not.toHaveBeenCalled();
  });

  it("een auditfile met een eigen periode is geen boekjaar en wordt geweigerd", async () => {
    const res = await haal(`administratieId=${ADMIN}&formaat=xaf&van=2026-04-01&tot=2026-06-30`);
    expect(res.status).toBe(422);
    expect(((await res.json()) as { message: string }).message).toContain("één heel boekjaar");
    expect(m.leesXaf).not.toHaveBeenCalled();
  });

  it("de route is alleen voor PLATFORM_ADMIN", () => {
    const src = readFileSync(join(process.cwd(), "app/api/admin/boekhouding/export/route.ts"), "utf8");
    expect(src).toMatch(/withAdminAccess\(\["PLATFORM_ADMIN"\]/);
  });
});
