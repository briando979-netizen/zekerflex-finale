import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// De routes van het tabblad Bank (Beheer → Boekhouding → Bank): alleen platformbeheerder, geen persoonsgegevens in het
// auditspoor, private no-store, upload van hooguit 5 MB.

const IBAN = "NL91ABNA0417164300";

const m = vi.hoisted(() => ({
  recordAudit: vi.fn(async () => undefined),
  rollen: [] as string[][],
  verwerkNieuweTransacties: vi.fn(),
  koppelTransactie: vi.fn(),
  negeerTransactie: vi.fn(),
  heropenTransactie: vi.fn(),
  bankOverzicht: vi.fn(),
  transactieRij: vi.fn(),
  lijstBankRekeningen: vi.fn(),
  maakBankRekening: vi.fn(),
  importeerAfschrift: vi.fn(),
  boekBankRekening: { findUnique: vi.fn() },
}));

vi.mock("@/lib/audit", () => ({ recordAudit: m.recordAudit }));
vi.mock("@/lib/prisma", () => ({ prisma: { boekBankRekening: m.boekBankRekening } }));
vi.mock("@/lib/boekhouding/bank/matching", () => ({
  verwerkNieuweTransacties: m.verwerkNieuweTransacties,
  koppelTransactie: m.koppelTransactie,
  negeerTransactie: m.negeerTransactie,
  heropenTransactie: m.heropenTransactie,
}));
vi.mock("@/lib/boekhouding/bank/scherm", () => ({
  bankOverzicht: m.bankOverzicht,
  transactieRij: m.transactieRij,
  lijstBankRekeningen: m.lijstBankRekeningen,
  maakBankRekening: m.maakBankRekening,
}));
vi.mock("@/lib/boekhouding/bank/import", () => ({ importeerAfschrift: m.importeerAfschrift }));
vi.mock("@/lib/auth/handlers", () => ({
  withAdminAccess:
    (roles: string[], handler: (req: Request, ctx: { principal: { userId: string }; params: unknown }) => Promise<Response>) => {
      m.rollen.push(roles);
      return async (req: Request, ctx?: { params?: Promise<unknown> }) => {
        try {
          return await handler(req, { principal: { userId: "admin-1" }, params: (await ctx?.params) ?? {} });
        } catch (e) {
          const f = e as { status?: number; code?: string; message: string; name: string };
          if (f.name === "ZodError") return Response.json({ code: "VALIDATION_FAILED", message: f.message }, { status: 422 });
          return Response.json({ code: f.code, message: f.message }, { status: f.status ?? 500 });
        }
      };
    },
}));

const overzicht = await import("@/app/api/admin/boekhouding/bank/route");
const rekeningen = await import("@/app/api/admin/boekhouding/bank/rekeningen/route");
const upload = await import("@/app/api/admin/boekhouding/bank/upload/route");
const transactie = await import("@/app/api/admin/boekhouding/bank/transacties/[id]/route");

type Handler = (r: Request, c?: { params: Promise<unknown> }) => Promise<Response>;
const ADM = "cm0adm1234567890";
const TX = "cm0tx12345678901";
const json = (route: unknown, methode: string, body: unknown, id?: string) =>
  (route as Handler)(new Request("http://localhost/x", { method: methode, body: JSON.stringify(body) }), id ? { params: Promise.resolve({ id }) } : undefined);
const auditTekst = () => JSON.stringify(m.recordAudit.mock.calls);

beforeEach(() => {
  vi.clearAllMocks();
  m.bankOverzicht.mockResolvedValue({ rekeningen: [], transacties: [], afgekapt: false, telling: { evenKijken: 0, genegeerd: 0, gekoppeld: 0, nieuw: 0 }, categorieen: [], todo: [] });
  m.verwerkNieuweTransacties.mockResolvedValue({ bekeken: 3, geboekt: 1, gekoppeld: 0, evenKijken: 2, mislukt: 0 });
  m.transactieRij.mockResolvedValue({ id: TX, status: "GEKOPPELD" });
  m.koppelTransactie.mockResolvedValue({ boekstuk: "BK-2026-000001" });
});

describe("toegang", () => {
  it("elke route is alleen voor PLATFORM_ADMIN", () => {
    expect(m.rollen.length).toBe(6);
    for (const r of m.rollen) expect(r).toEqual(["PLATFORM_ADMIN"]);
  });

  it("de bestanden gebruiken withAdminAccess met PLATFORM_ADMIN en loggen niets met console", () => {
    const root = path.join(process.cwd(), "app/api/admin/boekhouding/bank");
    for (const f of ["route.ts", "rekeningen/route.ts", "upload/route.ts", "transacties/[id]/route.ts"]) {
      const bron = readFileSync(path.join(root, f), "utf8");
      expect(bron).toMatch(/withAdminAccess(<[^>]*>)?\(\["PLATFORM_ADMIN"\]/);
      expect(bron).not.toMatch(/console\./);
    }
  });
});

describe("GET en POST /bank", () => {
  it("geeft het overzicht, private en no-store", async () => {
    const res = await (overzicht.GET as Handler)(new Request(`http://localhost/api/admin/boekhouding/bank?administratieId=${ADM}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(m.bankOverzicht).toHaveBeenCalledWith(ADM);
  });

  it("vraagt een geldige administratie", async () => {
    expect((await (overzicht.GET as Handler)(new Request("http://localhost/x"))).status).toBe(422);
    expect((await (overzicht.GET as Handler)(new Request("http://localhost/x?administratieId=a"))).status).toBe(422);
  });

  it("opnieuw zoeken beoordeelt ook de transacties die op jou wachten en schrijft alleen aantallen in het auditspoor", async () => {
    const res = await json(overzicht.POST, "POST", { administratieId: ADM });
    expect(res.status).toBe(200);
    expect(m.verwerkNieuweTransacties).toHaveBeenCalledWith(ADM, { ookTwijfel: true, door: "admin-1" });
    const body = await res.json();
    expect(body.verwerkt).toMatchObject({ geboekt: 1, evenKijken: 2 });
    expect(m.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "boekhouding.bank_opnieuw_gezocht", targetId: ADM, metadata: expect.objectContaining({ geboekt: 1 }) }));
  });
});

describe("POST /bank/rekeningen", () => {
  it("voegt een bankrekening toe en zet het IBAN niet in het auditspoor of het antwoord", async () => {
    m.maakBankRekening.mockResolvedValue({ id: "bankrek1", administratieId: ADM, naam: "Zakelijk", ibanGemaskeerd: "NL•• •••• •••• 4300", valuta: "EUR", grootboekNummer: "1100", actief: true, aantalAfschriften: 0, laatsteBoekdag: null });
    const res = await json(rekeningen.POST, "POST", { administratieId: ADM, naam: "Zakelijk", iban: IBAN });
    expect(res.status).toBe(201);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(m.maakBankRekening).toHaveBeenCalledWith(expect.objectContaining({ iban: IBAN, naam: "Zakelijk" }));
    expect(JSON.stringify(await res.json())).not.toContain(IBAN);
    expect(auditTekst()).not.toMatch(/NL91|0417|Zakelijk/);
  });

  it("weigert een ontbrekende naam of IBAN", async () => {
    expect((await json(rekeningen.POST, "POST", { administratieId: ADM, naam: "", iban: IBAN })).status).toBe(422);
    expect((await json(rekeningen.POST, "POST", { administratieId: ADM, naam: "X", iban: "NL" })).status).toBe(422);
    expect(m.maakBankRekening).not.toHaveBeenCalled();
  });

  it("de rekeningen komen gemaskeerd terug", async () => {
    m.lijstBankRekeningen.mockResolvedValue([{ id: "b1", ibanGemaskeerd: "NL•• •••• •••• 4300" }]);
    const res = await (rekeningen.GET as Handler)(new Request(`http://localhost/x?administratieId=${ADM}`));
    expect(JSON.stringify(await res.json())).not.toContain(IBAN);
  });
});

describe("POST /bank/upload", () => {
  const uitkomst = { afschriftId: "afs1", alIngelezen: false, herkend: "ING (csv)", formaat: "CSV", totaal: 2, nieuw: 2, alBekend: 0, waarschuwingen: [], verwerkt: { bekeken: 2, geboekt: 1, gekoppeld: 0, evenKijken: 1, mislukt: 0 } };
  const formulier = (bestand: File | null, rekening: string | null = "cm0bankrek123456") => {
    const f = new FormData();
    if (rekening) f.set("bankRekeningId", rekening);
    if (bestand) f.set("bestand", bestand);
    return (upload.POST as Handler)(new Request("http://localhost/x", { method: "POST", body: f }));
  };

  beforeEach(() => {
    m.importeerAfschrift.mockResolvedValue(uitkomst);
    m.boekBankRekening.findUnique.mockResolvedValue({ administratieId: ADM });
  });

  it("leest het bestand in en schrijft alleen id's en aantallen in het auditspoor", async () => {
    const res = await formulier(new File([`Datum;Bedrag\n02-11-2026;1,00\n${IBAN}`], "afschrift.csv", { type: "text/csv" }));
    expect(res.status).toBe(201);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    const aanroep = m.importeerAfschrift.mock.calls[0]?.[0] as { bankRekeningId: string; bytes: Buffer; door: string };
    expect(aanroep.bankRekeningId).toBe("cm0bankrek123456");
    expect(aanroep.door).toBe("admin-1");
    expect(Buffer.isBuffer(aanroep.bytes)).toBe(true);
    expect(m.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "boekhouding.bankafschrift_ingelezen", targetId: "afs1", metadata: expect.objectContaining({ totaal: 2, nieuw: 2, geboekt: 1 }) }));
    expect(auditTekst()).not.toMatch(/NL91|afschrift\.csv|Klant/);
    expect(m.bankOverzicht).toHaveBeenCalledWith(ADM);
  });

  it("een bestand dat al was ingelezen geeft 200 in plaats van 201", async () => {
    m.importeerAfschrift.mockResolvedValue({ ...uitkomst, alIngelezen: true });
    expect((await formulier(new File(["a;b\n1;2"], "x.csv"))).status).toBe(200);
  });

  it("weigert een bestand boven 5 MB, een ontbrekend bestand en een ontbrekende rekening, zonder iets in te lezen", async () => {
    const groot = await formulier(new File([new Uint8Array(5 * 1024 * 1024 + 1)], "groot.csv"));
    expect(groot.status).toBe(422);
    expect((await groot.json()).message).toMatch(/groter dan 5 MB/);
    expect((await formulier(null)).status).toBe(422);
    expect((await formulier(new File(["x"], "x.csv"), null)).status).toBe(422);
    expect(m.importeerAfschrift).not.toHaveBeenCalled();
  });

  it("geeft de Nederlandse fout van het inlezen door (formaat niet herkend)", async () => {
    const { AppError } = await import("@/lib/errors");
    m.importeerAfschrift.mockRejectedValue(AppError.validation("Formaat niet herkend. We lezen CAMT.053."));
    const res = await formulier(new File(["a;b\n1;2"], "x.csv"));
    expect(res.status).toBe(422);
    expect((await res.json()).message).toMatch(/Formaat niet herkend/);
    expect(m.recordAudit).not.toHaveBeenCalled();
  });
});

describe("PATCH /bank/transacties/[id]", () => {
  it("koppelt aan een factuur en geeft de serverversie van de transactie terug", async () => {
    const res = await json(transactie.PATCH, "PATCH", { actie: "koppel", factuurId: "cm0factuur123456" }, TX);
    expect(res.status).toBe(200);
    expect(m.koppelTransactie).toHaveBeenCalledWith(TX, { factuurId: "cm0factuur123456" }, "admin-1");
    const body = await res.json();
    expect(body).toMatchObject({ transactie: { id: TX, status: "GEKOPPELD" }, boekstuk: "BK-2026-000001" });
    expect(m.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "boekhouding.banktransactie_koppel", targetId: TX, metadata: { soort: "koppel_factuur", geboekt: true } }));
  });

  it("koppelt aan een bon of als kosten", async () => {
    await json(transactie.PATCH, "PATCH", { actie: "koppel", bonId: "cm0bon123456789a" }, TX);
    expect(m.koppelTransactie).toHaveBeenLastCalledWith(TX, { bonId: "cm0bon123456789a" }, "admin-1");
    await json(transactie.PATCH, "PATCH", { actie: "koppel", rekeningNummer: "4800" }, TX);
    expect(m.koppelTransactie).toHaveBeenLastCalledWith(TX, { rekeningNummer: "4800" }, "admin-1");
  });

  it("eist precies één ding om aan te koppelen en een geldig rekeningnummer", async () => {
    const geen = await json(transactie.PATCH, "PATCH", { actie: "koppel" }, TX);
    expect(geen.status).toBe(422);
    const twee = await json(transactie.PATCH, "PATCH", { actie: "koppel", factuurId: "cm0factuur123456", rekeningNummer: "4800" }, TX);
    expect(twee.status).toBe(422);
    expect((await json(transactie.PATCH, "PATCH", { actie: "koppel", rekeningNummer: "kosten" }, TX)).status).toBe(422);
    expect(m.koppelTransactie).not.toHaveBeenCalled();
  });

  it("negeert met een reden, zonder de reden in het auditspoor", async () => {
    const res = await json(transactie.PATCH, "PATCH", { actie: "negeer", reden: "Privé-overschrijving van de eigenaar" }, TX);
    expect(res.status).toBe(200);
    expect(m.negeerTransactie).toHaveBeenCalledWith(TX, "Privé-overschrijving van de eigenaar", "admin-1");
    expect(auditTekst()).not.toMatch(/Privé/);
    expect((await json(transactie.PATCH, "PATCH", { actie: "negeer", reden: "ab" }, TX)).status).toBe(422);
  });

  it("zet een genegeerde transactie terug", async () => {
    const res = await json(transactie.PATCH, "PATCH", { actie: "heropen" }, TX);
    expect(res.status).toBe(200);
    expect(m.heropenTransactie).toHaveBeenCalledWith(TX);
  });

  it("weigert een ongeldig id en een onbekende actie", async () => {
    expect((await json(transactie.PATCH, "PATCH", { actie: "heropen" }, "../etc")).status).toBe(422);
    expect((await json(transactie.PATCH, "PATCH", { actie: "verwijder" }, TX)).status).toBe(422);
    expect(m.heropenTransactie).not.toHaveBeenCalled();
  });

  it("geeft de fout van het koppelen door en schrijft dan niets in het auditspoor", async () => {
    const { AppError } = await import("@/lib/errors");
    m.koppelTransactie.mockRejectedValue(AppError.validation("De periode 2026-11 is vergrendeld."));
    const res = await json(transactie.PATCH, "PATCH", { actie: "koppel", rekeningNummer: "4800" }, TX);
    expect(res.status).toBe(422);
    expect(m.recordAudit).not.toHaveBeenCalled();
  });
});
