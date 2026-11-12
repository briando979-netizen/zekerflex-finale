import { beforeEach, describe, expect, it, vi } from "vitest";

// De uitzendovereenkomst moet te lezen zijn VÓÓR het tekenen (voorbeeld, niets wordt bewaard) en daarna terug te lezen
// en te downloaden. Eén bron voor de tekst (lib/agreements/uitzend-tekst.ts), gebruikt door het scherm én de pdf.

const h = vi.hoisted(() => ({
  store: new Map<string, unknown[]>(),
  appends: vi.fn(),
  payroll: true,
  user: "u1",
}));

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/auth", () => ({ requirePrincipal: async () => ({ userId: h.user, fullName: "Test Werker" }), requireRole: vi.fn() }));
vi.mock("@/lib/fiscal/store", () => ({
  getFiscal: async () => ({ bsnLast4: "1234" }),
  invoiceModeFor: () => (h.payroll ? "payroll" : "self-invoice"),
}));
vi.mock("@/lib/payroll/uitzend-status", () => ({ getUitzendStatus: async () => ({ phase: "A", weeksWorked: 12 }) }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => h.store.get(k) ?? null,
  kvAppend: async (k: string, v: unknown) => {
    h.appends(k, v);
    h.store.set(k, [...(h.store.get(k) ?? []), v]);
  },
}));

import { signUitzendContract, voorbeeldUitzendContract } from "@/lib/agreements/uitzend-contract";
import { uitzendContractBlokken, uitzendContractTekst } from "@/lib/agreements/uitzend-tekst";
import { uitzendContractPdf } from "@/lib/pdf/documents";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";

const tekstRoute = await import("@/app/api/me/uitzend/contract/tekst/route");
const pdfRoute = await import("@/app/api/me/uitzend/contract/pdf/route");

const NU = new Date("2026-11-12T10:00:00+01:00");
const alleTekst = (blokken: ReturnType<typeof uitzendContractBlokken>) => blokken.map((b) => ("tekst" in b ? b.tekst : "")).join("\n");

beforeEach(() => {
  vi.clearAllMocks();
  h.store.clear();
  h.payroll = true;
  h.user = "u1";
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NU);
});

describe("de tekst van de overeenkomst", () => {
  it("bevat de belangrijke artikelen: loon, fase, pensioen en einde", async () => {
    const c = await voorbeeldUitzendContract("u1", "Test Werker", NU);
    const tekst = alleTekst(uitzendContractBlokken(c, { voorbeeld: true }));
    for (const zin of ["Artikel 2 - Duur", "Artikel 4 - Loon en reserveringen", "8,33% vakantiegeld", "Artikel 5 - Pensioen (StiPP)", "Artikel 7 - Einde van de overeenkomst", "fase A", "12 gewerkte weken", "Test Werker"]) {
      expect(tekst, zin).toContain(zin);
    }
  });

  it("het voorbeeld zegt dat er nog niets is ondertekend; de getekende versie noemt het tijdstip", async () => {
    const c = await voorbeeldUitzendContract("u1", "Test Werker", NU);
    const voorbeeld = alleTekst(uitzendContractBlokken(c, { voorbeeld: true }));
    expect(voorbeeld).toContain("Dit is een voorbeeld");
    expect(voorbeeld).not.toContain("heeft deze uitzendovereenkomst elektronisch aanvaard door");
    const getekend = alleTekst(uitzendContractBlokken({ ...c, reference: "ZF-UZO-2026-001-abc" }));
    expect(getekend).toContain("heeft deze uitzendovereenkomst elektronisch aanvaard door");
    expect(getekend).not.toContain("Dit is een voorbeeld");
  });

  it("de pakketten voor het scherm hebben de gegevens voor de kernpunten (Amsterdamse tijd)", async () => {
    const c = await voorbeeldUitzendContract("u1", "Test Werker", NU);
    const p = uitzendContractTekst(c, { voorbeeld: true });
    expect(p).toMatchObject({ voorbeeld: true, referentie: "VOORBEELD", gegevens: { fase: "A", weken: 12, ondertekend: null } });
    expect(p.gegevens.tot > p.gegevens.van).toBe(true);
  });

  it("de pdf wordt uit dezelfde blokken opgebouwd: geldig, ook als voorbeeld", async () => {
    const c = await voorbeeldUitzendContract("u1", "Test Werker", NU);
    const echt = uitzendContractPdf({ ...c, reference: "ZF-UZO-2026-001-abc" });
    expect(echt.filename).toBe("ZF-UZO-2026-001-abc.pdf");
    expect(echt.bytes.subarray(0, 4).toString()).toBe("%PDF");
    const voorbeeld = uitzendContractPdf(c, { voorbeeld: true });
    expect(voorbeeld.filename).toBe("uitzendovereenkomst-voorbeeld.pdf");
    expect(voorbeeld.bytes.subarray(0, 4).toString()).toBe("%PDF");
  });
});

describe("GET /api/me/uitzend/contract/tekst", () => {
  const vraag = (q = "") => (tekstRoute.GET as (r: Request) => Promise<Response>)(new Request(`http://localhost/api/me/uitzend/contract/tekst${q}`));

  it("zonder id: het voorbeeld, en er wordt niets bewaard", async () => {
    const res = await vraag();
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.voorbeeld).toBe(true);
    expect(d.referentie).toBe("VOORBEELD");
    expect(Array.isArray(d.blokken) && d.blokken.length).toBeGreaterThan(20);
    expect(h.appends).not.toHaveBeenCalled();
    expect(h.store.size).toBe(0);
  });

  it("alleen een uitzendkracht leest het voorbeeld: een zzp'er krijgt 412", async () => {
    h.payroll = false;
    expect((await vraag()).status).toBe(412);
  });

  it("na het tekenen is de eigen overeenkomst terug te lezen, die van een ander niet", async () => {
    const { contract } = await signUitzendContract("u1", "Test Werker");
    const eigen = await vraag(`?id=${contract.id}`);
    expect(eigen.status).toBe(200);
    expect(await eigen.json()).toMatchObject({ voorbeeld: false, referentie: contract.reference });
    h.user = "u2";
    expect((await vraag(`?id=${contract.id}`)).status).toBe(404);
  });
});

describe("GET /api/me/uitzend/contract/pdf", () => {
  const pdf = (q: string) => (pdfRoute.GET as (r: Request) => Promise<Response>)(new Request(`http://localhost/api/me/uitzend/contract/pdf${q}`));

  it("het voorbeeld opent in de browser, en met download=1 als download", async () => {
    const open = await pdf("?voorbeeld=1");
    expect(open.status).toBe(200);
    expect(open.headers.get("content-type")).toBe("application/pdf");
    expect(open.headers.get("content-disposition")).toBe('inline; filename="uitzendovereenkomst-voorbeeld.pdf"');
    const download = await pdf("?voorbeeld=1&download=1");
    expect(download.headers.get("content-disposition")).toBe('attachment; filename="uitzendovereenkomst-voorbeeld.pdf"');
    expect(h.appends).not.toHaveBeenCalled();
  });

  it("een zzp'er krijgt het voorbeeld niet, en zonder getekende overeenkomst is er 404", async () => {
    h.payroll = false;
    expect((await pdf("?voorbeeld=1")).status).toBe(412);
    h.payroll = true;
    expect((await pdf("")).status).toBe(404);
  });

  it("de getekende overeenkomst is te downloaden", async () => {
    const { contract } = await signUitzendContract("u1", "Test Werker");
    const res = await pdf(`?id=${contract.id}&download=1`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("attachment");
  });
});

describe("knoppen en uitleg in vijf talen", () => {
  it("alle teksten bestaan, met plaatshouders voor fase, weken en datums", () => {
    for (const taal of ["nl", "en", "pl", "ro", "uk"] as const) {
      const t = FREELANCER_DICTS[taal].uitzendContract;
      for (const sleutel of ["lees", "verberg", "gelezen", "eerstLezen", "bindend", "pdfOpen", "pdfDownload", "kernLoon", "kernOpzeggen"] as const) {
        expect(t[sleutel].trim().length, `${taal} ${sleutel}`).toBeGreaterThan(3);
      }
      expect(t.kernFase, taal).toContain("{fase}");
      expect(t.kernFase, taal).toContain("{weken}");
      expect(t.kernDuur, taal).toContain("{van}");
      expect(t.kernDuur, taal).toContain("{tot}");
    }
  });
});
