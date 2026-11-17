import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Het scherm "Zakelijke gegevens" (17 nov 2026, eigenaar: "laten we ook zo een scherm creëren"): voor een zzp'er en een
// flexwerker heet Fiscaal zo, met een bedrijfsnaam, "KOR sinds" en het IBAN gemaskeerd met "Wijzig IBAN". Hetzelfde
// formulier en dezelfde route (PUT /api/me/fiscal): geen tweede bron.

const h = vi.hoisted(() => ({ kv: new Map<string, unknown>(), principal: { userId: "w1", roles: ["FREELANCER"], fullName: "Test Werker" } }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => h.kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void h.kv.set(k, v),
  kvListEntries: async () => [],
}));
vi.mock("@/lib/auth", () => ({ requirePrincipal: async () => h.principal, requireRole: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/integrations/vies", () => ({ checkVies: vi.fn(async (n: string) => ({ status: "valid", vatNumber: n })) }));
vi.mock("@/lib/compliance/documents", () => ({ flagIbanChanged: vi.fn() }));
vi.mock("@/lib/fiscal/iban-bevestiging", () => ({ bevestigIbanWijziging: vi.fn() }));

import {
  BEDRIJFSNAAM_MAX,
  bedrijfsnaamPast,
  bedrijfsnaamVooraf,
  bedrijfsnaamVoorOpslag,
  dagKort,
  korSindsGeldig,
  korSindsVooraf,
  maskeerIban,
  opslagBody,
  schoonBedrijfsnaam,
  zakelijkeWerkvorm,
} from "@/lib/fiscal/formulier";
import { EMPTY_FISCAL, getFiscal } from "@/lib/fiscal/store";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";
import { FOUTEN } from "@/lib/i18n/fouten";

const route = await import("@/app/api/me/fiscal/route");
const put = (body: unknown) => (route.PUT as (r: Request) => Promise<Response>)(new Request("http://localhost/api/me/fiscal", { method: "PUT", body: JSON.stringify(body) }));
const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");

beforeEach(() => h.kv.clear());
afterEach(() => vi.useRealTimers());

describe("welke werkvorm 'Zakelijke gegevens' krijgt", () => {
  it("zzp'er en flexwerker wel, een uitzendkracht en wie nog niet koos niet", () => {
    expect(zakelijkeWerkvorm("zzp")).toBe(true);
    expect(zakelijkeWerkvorm("flexwerker")).toBe(true);
    expect(zakelijkeWerkvorm("uitzendkracht")).toBe(false);
    expect(zakelijkeWerkvorm(null)).toBe(false);
    expect(zakelijkeWerkvorm(undefined)).toBe(false);
  });
});

describe("de bedrijfsnaam", () => {
  it("wordt opgeschoond: randen eraf, alle witruimte één spatie", () => {
    expect(schoonBedrijfsnaam("  Bakkerij   de Zon  ")).toBe("Bakkerij de Zon");
    expect(schoonBedrijfsnaam("Schilder\n\tJansen")).toBe("Schilder Jansen");
    expect(schoonBedrijfsnaam("   ")).toBe("");
    expect(schoonBedrijfsnaam(null)).toBe("");
    expect(schoonBedrijfsnaam(undefined)).toBe("");
  });

  it("mag leeg zijn en ten hoogste BEDRIJFSNAAM_MAX tekens lang (na het opschonen)", () => {
    expect(BEDRIJFSNAAM_MAX).toBe(120);
    expect(bedrijfsnaamPast("")).toBe(true);
    expect(bedrijfsnaamPast("a".repeat(BEDRIJFSNAAM_MAX))).toBe(true);
    expect(bedrijfsnaamPast(`  ${"a".repeat(BEDRIJFSNAAM_MAX)}  `)).toBe(true);
    expect(bedrijfsnaamPast("a".repeat(BEDRIJFSNAAM_MAX + 1))).toBe(false);
  });

  it("gaat alleen mee als hij is ingevuld, of als een bewaarde naam bewust is leeggemaakt", () => {
    expect(bedrijfsnaamVoorOpslag(" Bakkerij de Zon ", undefined)).toEqual({ bedrijfsnaam: "Bakkerij de Zon" });
    expect(bedrijfsnaamVoorOpslag("", "Bakkerij de Zon")).toEqual({ bedrijfsnaam: "" });
    // nooit iets ingevuld: niets meesturen, zodat een later gecontroleerde KVK-naam nog kan worden voorgevuld
    expect(bedrijfsnaamVoorOpslag("  ", undefined)).toEqual({});
    expect(bedrijfsnaamVoorOpslag("", null)).toEqual({});
  });

  it("vult de KVK-naam alleen voor als er nooit iets is ingevuld; een bewaarde of bewust lege naam blijft", () => {
    expect(bedrijfsnaamVooraf(undefined, "  Bakkerij de Zon B.V. ")).toBe("Bakkerij de Zon B.V.");
    expect(bedrijfsnaamVooraf(undefined, "")).toBe("");
    expect(bedrijfsnaamVooraf(undefined, undefined)).toBe("");
    expect(bedrijfsnaamVooraf("Eigen Naam", "Bakkerij de Zon B.V.")).toBe("Eigen Naam");
    expect(bedrijfsnaamVooraf(null, "Bakkerij de Zon B.V.")).toBe("");
    expect(bedrijfsnaamVooraf(undefined, "x".repeat(300))).toHaveLength(BEDRIJFSNAAM_MAX);
  });
});

describe("KOR sinds", () => {
  it("vandaag mag, morgen niet: de Nederlandse datum telt, niet die van de server (UTC)", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // 00:30 in Amsterdam is in UTC nog 16 november
    vi.setSystemTime(new Date("2026-11-17T00:30:00+01:00"));
    expect(korSindsGeldig("2026-11-17")).toBe(true);
    expect(korSindsGeldig("2026-11-18")).toBe(false);
    expect(korSindsGeldig("2026-11-16")).toBe(true);
    // zomertijd: 01:30 in Amsterdam is in UTC nog 30 juni
    vi.setSystemTime(new Date("2026-07-01T01:30:00+02:00"));
    expect(korSindsGeldig("2026-07-01")).toBe(true);
    expect(korSindsGeldig("2026-07-02")).toBe(false);
  });

  it("alleen een bestaande dag als YYYY-MM-DD, niet vóór 1969", () => {
    const vandaag = "2026-11-17";
    expect(korSindsGeldig("2020-01-01", vandaag)).toBe(true);
    expect(korSindsGeldig("1969-01-01", vandaag)).toBe(true);
    expect(korSindsGeldig("1968-12-31", vandaag)).toBe(false);
    expect(korSindsGeldig("2026-02-30", vandaag)).toBe(false);
    expect(korSindsGeldig("2026-13-01", vandaag)).toBe(false);
    expect(korSindsGeldig("0069-01-01", vandaag)).toBe(false);
    expect(korSindsGeldig("17-11-2026", vandaag)).toBe(false);
    expect(korSindsGeldig("", vandaag)).toBe(false);
  });

  it("vult bij openen de bewaarde datum voor, anders een al ingegane datum uit de KOR-hulp", () => {
    expect(korSindsVooraf("2024-04-01", "2025-01-01", "2026-11-17")).toBe("2024-04-01");
    expect(korSindsVooraf(null, "2026-10-01", "2026-11-17")).toBe("2026-10-01");
    // een ingang in de toekomst zou het opslaan tegenhouden: dan niets voorvullen
    expect(korSindsVooraf(undefined, "2027-01-01", "2026-11-17")).toBe("");
    expect(korSindsVooraf(undefined, "2026-10-01", undefined)).toBe("");
    expect(korSindsVooraf(undefined, null, "2026-11-17")).toBe("");
  });

  it("wordt getoond als dag-maand-jaar, gelijk op server en browser", () => {
    expect(dagKort("2024-04-01")).toBe("01-04-2024");
    expect(dagKort("onzin")).toBe("onzin");
  });
});

describe("het IBAN gemaskeerd", () => {
  it("landcode en de laatste 4 zichtbaar, de rest als stippen in groepjes vanaf het eind", () => {
    expect(maskeerIban("NL91ABNA0417164300")).toBe("NL •••• •••• •••• 4300");
    expect(maskeerIban("nl91 abna 0417 1643 00")).toBe("NL •••• •••• •••• 4300");
    expect(maskeerIban("DE89370400440532013000")).toBe("DE •••• •••• •••• •••• 3000");
    expect(maskeerIban("NO9386011117947")).toBe("NO • •••• •••• 7947");
    expect(maskeerIban("1234")).toBe("1234");
  });

  it("toont nooit meer dan de landcode en de laatste 4 tekens", () => {
    const m = maskeerIban("NL91ABNA0417164300");
    expect(m.replace(/[•\s]/g, "")).toBe("NL4300");
  });
});

describe("de opslag-body van het formulier", () => {
  const basis = { iban: "", kor: false, vatRequested: false, vatNumber: "", kvkNumber: "", bsn: "", ibanCode: "" };

  it("een zzp'er stuurt de opgeschoonde bedrijfsnaam mee, een uitzendkracht nooit", () => {
    expect(opslagBody({ ...basis, kind: "zzp", bedrijfsnaam: " Bakkerij  de Zon " })).toMatchObject({ bedrijfsnaam: "Bakkerij de Zon" });
    expect(Object.keys(opslagBody({ ...basis, kind: "uitzendkracht", bedrijfsnaam: "Bakkerij de Zon" }))).not.toContain("bedrijfsnaam");
  });

  it("een leeg naamveld gaat alleen mee als er een naam bewaard was", () => {
    expect(opslagBody({ ...basis, kind: "flexwerker", bedrijfsnaam: "", bedrijfsnaamWas: "Oud" })).toMatchObject({ bedrijfsnaam: "" });
    expect(Object.keys(opslagBody({ ...basis, kind: "flexwerker", bedrijfsnaam: "", bedrijfsnaamWas: undefined }))).not.toContain("bedrijfsnaam");
  });

  it("KOR sinds gaat alleen mee bij een flexwerker die de KOR al gebruikt", () => {
    expect(opslagBody({ ...basis, kind: "flexwerker", kor: true, korSinds: "2024-04-01" })).toMatchObject({ korApplies: true, korSinds: "2024-04-01" });
    expect(Object.keys(opslagBody({ ...basis, kind: "flexwerker", kor: false, korSinds: "2024-04-01" }))).not.toContain("korSinds");
    expect(Object.keys(opslagBody({ ...basis, kind: "zzp", kor: true, korSinds: "2024-04-01" }))).not.toContain("korSinds");
  });

  it("zonder de nieuwe velden blijft de body zoals hij was", () => {
    expect(opslagBody({ ...basis, kind: "zzp", kvkNumber: "12345678" })).toEqual({ workerKind: "zzp", korApplies: false, vatRequested: false, kvkNumber: "12345678" });
  });
});

describe("PUT /api/me/fiscal: bedrijfsnaam en KOR sinds", () => {
  it("bewaart de bedrijfsnaam opgeschoond; leeg maakt hem null; ontbreekt hij, dan blijft hij", async () => {
    h.kv.set("fiscal:w1", { ...EMPTY_FISCAL, workerKind: "zzp", kvkNumber: "12345678" });
    expect((await put({ workerKind: "zzp", bedrijfsnaam: "  Bakkerij   de Zon " })).status).toBe(200);
    expect((await getFiscal("w1")).bedrijfsnaam).toBe("Bakkerij de Zon");
    expect((await put({ workerKind: "zzp", vatRequested: true })).status).toBe(200);
    expect((await getFiscal("w1")).bedrijfsnaam).toBe("Bakkerij de Zon");
    expect((await put({ workerKind: "zzp", bedrijfsnaam: "   " })).status).toBe(200);
    expect((await getFiscal("w1")).bedrijfsnaam).toBeNull();
  });

  it("een te lange bedrijfsnaam geeft 422 en verandert niets", async () => {
    h.kv.set("fiscal:w1", { ...EMPTY_FISCAL, workerKind: "zzp", bedrijfsnaam: "Oud" });
    const res = await put({ workerKind: "zzp", bedrijfsnaam: "a".repeat(BEDRIJFSNAAM_MAX + 1) });
    expect(res.status).toBe(422);
    expect((await getFiscal("w1")).bedrijfsnaam).toBe("Oud");
  });

  it("KOR sinds: een geldige datum wordt bewaard, een datum in de toekomst geeft 422 met een vertaalde sleutel", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-17T00:30:00+01:00"));
    h.kv.set("fiscal:w1", { ...EMPTY_FISCAL, workerKind: "flexwerker", korApplies: true });
    expect((await put({ workerKind: "flexwerker", korApplies: true, korSinds: "2026-11-17" })).status).toBe(200);
    expect((await getFiscal("w1")).korSinds).toBe("2026-11-17");

    const res = await put({ workerKind: "flexwerker", korApplies: true, korSinds: "2026-11-18" });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { sleutel?: string; message: string } };
    expect(body.error.sleutel).toBe("fiscal.korSinds");
    expect(body.error.message).toBe(FOUTEN["fiscal.korSinds"]!.nl);
    expect((await getFiscal("w1")).korSinds).toBe("2026-11-17");

    expect((await put({ workerKind: "flexwerker", korApplies: true, korSinds: "2026-02-30" })).status).toBe(422);
  });

  it("KOR sinds leeg maakt de datum leeg; zonder KOR hoort er geen begindatum bij", async () => {
    h.kv.set("fiscal:w1", { ...EMPTY_FISCAL, workerKind: "flexwerker", korApplies: true, korSinds: "2024-04-01" });
    expect((await put({ workerKind: "flexwerker", korApplies: true, korSinds: "" })).status).toBe(200);
    expect((await getFiscal("w1")).korSinds).toBeNull();

    h.kv.set("fiscal:w1", { ...EMPTY_FISCAL, workerKind: "flexwerker", korApplies: true, korSinds: "2024-04-01" });
    expect((await put({ workerKind: "flexwerker", korApplies: false, vatRequested: true })).status).toBe(200);
    const f = await getFiscal("w1");
    expect(f.korApplies).toBe(false);
    expect(f.korSinds).toBeNull();
  });

  it("de KOR-datum blijft staan bij een opslag die de KOR niet raakt (GegevensMist stuurt alleen wat verandert)", async () => {
    h.kv.set("fiscal:w1", { ...EMPTY_FISCAL, workerKind: "flexwerker", korApplies: true, korSinds: "2024-04-01" });
    expect((await put({ workerKind: "flexwerker", vatRequested: true })).status).toBe(200);
    expect((await getFiscal("w1")).korSinds).toBe("2024-04-01");
  });
});

describe("de teksten in vijf talen", () => {
  const NIEUW = ["titelZakelijk", "subtitelZakelijk", "stap2Zakelijk", "opgeslagenZakelijk", "bedrijfsnaam", "bedrijfsnaamHint", "bedrijfsnaamUitKvk", "korSinds", "korSindsHint", "korSindsFout", "jaSinds", "wijzigIban", "wijzigIbanUitleg", "annuleren", "ibanEindigt"] as const;

  it("elke taal heeft elke nieuwe sleutel, met dezelfde plaatshouders", () => {
    for (const [taal, d] of Object.entries(FREELANCER_DICTS)) {
      for (const k of NIEUW) expect(d.fiscaalForm[k].length, `${taal} ${k}`).toBeGreaterThan(1);
      expect(d.fiscaalForm.jaSinds, taal).toContain("{datum}");
      expect(d.fiscaalForm.ibanEindigt, taal).toContain("{laatste4}");
      expect(d.administratie.zakelijk.length, `${taal} administratie.zakelijk`).toBeGreaterThan(3);
      for (const t of ["nl", "en", "pl", "ro", "uk"] as const) expect(FOUTEN["fiscal.korSinds"]![t].length, t).toBeGreaterThan(10);
    }
  });

  it("de titel is 'Zakelijke gegevens', gelijk aan het menu-item in Account; de uitzendkracht houdt zijn titel", () => {
    const nl = FREELANCER_DICTS.nl;
    expect(nl.fiscaalForm.titelZakelijk).toBe("Zakelijke gegevens");
    expect(nl.fiscaalForm.titelZakelijk).toBe(nl.acct.business);
    expect(nl.fiscaalForm.titel).toBe("Werkvorm & fiscale gegevens");
    for (const d of Object.values(FREELANCER_DICTS)) expect(d.fiscaalForm.titelZakelijk).toBe(d.acct.business);
  });
});

describe("het scherm en de ingangen", () => {
  it("de pagina kiest de titel per werkvorm en geeft de KVK-naam en de Nederlandse dag mee", () => {
    const pagina = bron("app/dashboard/fiscaal/page.tsx");
    expect(pagina).toContain("title={zakelijk ? f.titelZakelijk : f.titel}");
    expect(pagina).toContain("vandaag={amsterdamDayKey(new Date())}");
    expect(pagina).toContain("profiel?.kvkValid");
  });

  it("het formulier maskeert een bewaard IBAN en houdt de codestap van de route", () => {
    const form = bron("components/app/FiscalForm.tsx");
    expect(form).toContain("maskeerIban(opgeslagenIban)");
    expect(form).toContain("{f.wijzigIban}");
    expect(form).toContain('data.error.code.startsWith("IBAN_")');
    expect(form).toContain('role="alert"');
  });

  it("Account en de administratie linken naar Zakelijke gegevens", () => {
    expect(bron("app/dashboard/account/page.tsx")).toContain('{ label: t.business, href: "/dashboard/fiscaal" }');
    const admin = bron("app/dashboard/administratie/page.tsx");
    expect(admin).toContain("zakelijkeWerkvorm(data.workerKind)");
    expect(admin).toContain("{t.zakelijk}");
  });
});
