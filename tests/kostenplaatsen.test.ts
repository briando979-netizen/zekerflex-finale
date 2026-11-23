import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Instellingen → Kostenplaatsen (23 nov 2026, naar YoungOnes): een eigen pagina met lijst, toevoegen, wijzigen en verwijderen, in plaats
// van een tekstvak op Facturen. Eerst de regels (puur), dan de opslag en de API (KV, geen schemawijziging), dan het scherm en de teksten.

const m = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  audits: [] as { action: string; summary: string; actorUserId?: string | null; targetId?: string | null }[],
  principal: { userId: "u-beheer", email: "beheer@bedrijf.test", grants: [{ role: "HQ_ADMIN", organizationId: "tenantAAA1" }] } as { userId: string; email: string; grants: { role: string; organizationId: string }[] },
  vestigingen: [] as { costCenter: string | null; _count: { _all: number } }[],
  klussen: [] as { kostenplaats: string | null; _count: { _all: number } }[],
  vragen: [] as { soort: string; q: { where: Record<string, unknown> } }[],
}));

vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (m.kv.has(k) ? structuredClone(m.kv.get(k)) : null),
  kvGetMany: async () => new Map(),
  kvSet: async (k: string, v: unknown) => void m.kv.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void m.kv.delete(k),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    branch: { groupBy: async (q: { where: Record<string, unknown> }) => (m.vragen.push({ soort: "branch", q }), m.vestigingen) },
    shift: { groupBy: async (q: { where: Record<string, unknown> }) => (m.vragen.push({ soort: "shift", q }), m.klussen) },
  },
}));
vi.mock("@/lib/auth", () => ({
  requirePrincipal: async () => m.principal,
  hasRole: (p: { grants: { role: string }[] }, ...rollen: string[]) => p.grants.some((g) => rollen.includes(g.role)),
}));
vi.mock("@/lib/dashboard/employer", () => ({ resolveEmployerScope: async () => ({ tenantIds: ["tenantAAA1"], branchIds: null }) }));
vi.mock("@/lib/audit", () => ({ recordAudit: async (a: { action: string; summary: string }) => void m.audits.push(a) }));

import { nl } from "@/lib/i18n/dictionaries";
import { en } from "@/lib/i18n/dictionary-en";
import {
  KOSTENPLAATS_LENGTE,
  KOSTENPLAATS_MAX,
  hernoemKostenplaats,
  leesKostenplaatsen,
  schoonKostenplaats,
  verwijderKostenplaats,
  voegKostenplaatsToe,
} from "@/lib/werkgever/kostenplaatsen-kern";
import { kostenplaatsGebruik, lijstKostenplaatsen } from "@/lib/werkgever/kostenplaatsen";
import { DELETE, GET, PATCH, POST } from "@/app/api/werkgever/kostenplaatsen/route";

const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");
const SLEUTEL = "profile-org:tenantAAA1";

beforeEach(() => {
  m.kv.clear();
  m.audits.length = 0;
  m.vragen.length = 0;
  m.vestigingen = [];
  m.klussen = [];
  m.principal = { userId: "u-beheer", email: "beheer@bedrijf.test", grants: [{ role: "HQ_ADMIN", organizationId: "tenantAAA1" }] };
});

describe("de regels (puur)", () => {
  it("een naam wordt netjes: spaties en regelovergangen worden één spatie, rommel is leeg", () => {
    expect(schoonKostenplaats("  PO-2026 \n Amsterdam  ")).toBe("PO-2026 Amsterdam");
    expect(schoonKostenplaats(12)).toBe("");
    expect(schoonKostenplaats(null)).toBe("");
  });

  it("de opgeslagen lijst wordt nette lijst: leeg en dubbel weg (hoofdletters tellen niet), volgorde blijft", () => {
    expect(leesKostenplaatsen(undefined)).toEqual([]);
    expect(leesKostenplaatsen(["PO-1", "  ", "po-1", " Kantoor  Zuid ", "PO-2"])).toEqual(["PO-1", "Kantoor Zuid", "PO-2"]);
  });

  it("toevoegen zet hem achteraan; leeg, te lang, dubbel en een volle lijst kunnen niet", () => {
    expect(voegKostenplaatsToe(["PO-1"], " PO-2 ")).toEqual({ ok: true, lijst: ["PO-1", "PO-2"] });
    expect(voegKostenplaatsToe([], "   ")).toEqual({ ok: false, fout: "leeg" });
    expect(voegKostenplaatsToe([], "x".repeat(KOSTENPLAATS_LENGTE + 1))).toEqual({ ok: false, fout: "te-lang" });
    expect(voegKostenplaatsToe([], "x".repeat(KOSTENPLAATS_LENGTE))).toMatchObject({ ok: true });
    expect(voegKostenplaatsToe(["PO-1"], "po-1")).toEqual({ ok: false, fout: "dubbel" });
    const vol = Array.from({ length: KOSTENPLAATS_MAX }, (_, i) => `K${i}`);
    expect(voegKostenplaatsToe(vol, "nieuw")).toEqual({ ok: false, fout: "vol" });
  });

  it("de grenzen zijn die van de rest van het systeem (PUT /api/orgs en het uitzetten van een klus)", () => {
    expect(KOSTENPLAATS_MAX).toBe(50);
    expect(KOSTENPLAATS_LENGTE).toBe(60);
    expect(lees("app/api/orgs/route.ts")).toContain(".min(1).max(60)).max(50)");
    expect(lees("lib/shifts/create.ts")).toContain("kostenplaats: z.string().trim().max(60).optional()");
    expect(nl.kostenplaatsPagina.foutTeLang).toContain(String(KOSTENPLAATS_LENGTE));
    expect(nl.kostenplaatsPagina.foutVol).toContain(String(KOSTENPLAATS_MAX));
    expect(en.kostenplaatsPagina.foutTeLang).toContain(String(KOSTENPLAATS_LENGTE));
    expect(en.kostenplaatsPagina.foutVol).toContain(String(KOSTENPLAATS_MAX));
  });

  it("hernoemen houdt de plek in de lijst, en kan alleen als de kostenplaats nergens in gebruik is", () => {
    const lijst = ["PO-1", "PO-2", "PO-3"];
    expect(hernoemKostenplaats(lijst, "PO-2", "PO-twee", 0)).toEqual({ ok: true, lijst: ["PO-1", "PO-twee", "PO-3"] });
    expect(hernoemKostenplaats(lijst, "PO-2", "PO-twee", 3)).toEqual({ ok: false, fout: "in-gebruik" });
    // dezelfde naam opnieuw verandert niets: dat mag ook als hij in gebruik is
    expect(hernoemKostenplaats(lijst, "PO-2", "PO-2", 3)).toEqual({ ok: true, lijst });
    // alleen een andere hoofdletter mag als hij vrij is, en botst niet met zichzelf
    expect(hernoemKostenplaats(lijst, "PO-2", "po-2", 0)).toEqual({ ok: true, lijst: ["PO-1", "po-2", "PO-3"] });
    expect(hernoemKostenplaats(lijst, "PO-2", "po-3", 0)).toEqual({ ok: false, fout: "dubbel" });
    expect(hernoemKostenplaats(lijst, "PO-2", " ", 0)).toEqual({ ok: false, fout: "leeg" });
    expect(hernoemKostenplaats(lijst, "weg", "iets", 0)).toEqual({ ok: false, fout: "onbekend" });
  });

  it("verwijderen kan alleen als hij nergens in gebruik is", () => {
    expect(verwijderKostenplaats(["PO-1", "PO-2"], "PO-1", 0)).toEqual({ ok: true, lijst: ["PO-2"] });
    expect(verwijderKostenplaats(["PO-1", "PO-2"], "PO-1", 1)).toEqual({ ok: false, fout: "in-gebruik" });
    expect(verwijderKostenplaats(["PO-1"], "PO-9", 0)).toEqual({ ok: false, fout: "onbekend" });
  });
});

describe("het gebruik: vestigingen en lopende klussen van dit bedrijf", () => {
  it("telt per kostenplaats de vestigingen en de lopende klussen samen, en niets bij een lege lijst", async () => {
    expect((await kostenplaatsGebruik("tenantAAA1", [])).size).toBe(0);
    expect(m.vragen).toEqual([]);
    m.vestigingen = [{ costCenter: "PO-2", _count: { _all: 1 } }];
    m.klussen = [{ kostenplaats: "PO-2", _count: { _all: 3 } }, { kostenplaats: "PO-3", _count: { _all: 2 } }];
    const g = await kostenplaatsGebruik("tenantAAA1", ["PO-1", "PO-2", "PO-3"]);
    expect(Object.fromEntries(g)).toEqual({ "PO-1": 0, "PO-2": 4, "PO-3": 2 });
  });

  it("kijkt alleen naar dit bedrijf en naar klussen die nog gepland staan of lopen (afgerond en geannuleerd houden hun naam als geschiedenis)", async () => {
    await kostenplaatsGebruik("tenantAAA1", ["PO-1"]);
    const branch = m.vragen.find((v) => v.soort === "branch");
    const shift = m.vragen.find((v) => v.soort === "shift");
    expect(branch?.q.where).toMatchObject({ tenantId: "tenantAAA1", costCenter: { in: ["PO-1"] } });
    expect(shift?.q.where).toMatchObject({ kostenplaats: { in: ["PO-1"] }, branch: { tenantId: "tenantAAA1" } });
    const statussen = (shift?.q.where.status as { in: string[] }).in;
    expect(statussen).toEqual(expect.arrayContaining(["OPEN", "FILLED", "IN_PROGRESS"]));
    expect(statussen).not.toContain("COMPLETED");
    expect(statussen).not.toContain("CANCELLED");
  });

  it("de lijst van een bedrijf zonder kostenplaatsen is leeg", async () => {
    expect(await lijstKostenplaatsen("tenantAAA1")).toEqual([]);
  });
});

describe("de API: /api/werkgever/kostenplaatsen", () => {
  const stuur = (methode: "POST" | "PATCH" | "DELETE", body: unknown) =>
    (methode === "POST" ? POST : methode === "PATCH" ? PATCH : DELETE)(
      new Request("http://localhost/api/werkgever/kostenplaatsen", { method: methode, body: typeof body === "string" ? body : JSON.stringify(body) }),
    );
  const bewaard = () => (m.kv.get(SLEUTEL) as { costCentres?: string[]; about?: string } | undefined)?.costCentres;

  it("GET geeft de lijst met het gebruik, en of je mag wijzigen", async () => {
    m.kv.set(SLEUTEL, { costCentres: ["PO-1", "PO-2"] });
    m.vestigingen = [{ costCenter: "PO-2", _count: { _all: 1 } }];
    m.klussen = [{ kostenplaats: "PO-2", _count: { _all: 3 } }];
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      kostenplaatsen: [{ naam: "PO-1", gebruik: 0 }, { naam: "PO-2", gebruik: 4 }],
      max: 50,
      kanBeheren: true,
    });
  });

  it("toevoegen: bewaard in de KV naast de rest van het profiel, het antwoord is de lijst van de server, en het staat in het auditspoor", async () => {
    m.kv.set(SLEUTEL, { about: "Wij zijn bakker", costCentres: ["PO-1"] });
    const res = await stuur("POST", { naam: "  PO-2 " });
    expect(res.status).toBe(201);
    expect((await res.json()).kostenplaatsen.map((k: { naam: string }) => k.naam)).toEqual(["PO-1", "PO-2"]);
    expect(bewaard()).toEqual(["PO-1", "PO-2"]);
    expect((m.kv.get(SLEUTEL) as { about?: string }).about).toBe("Wij zijn bakker");
    expect(m.audits).toEqual([expect.objectContaining({ action: "employer.costcentre.added", targetId: "tenantAAA1", actorUserId: "u-beheer" })]);
  });

  it("dubbel, leeg en te lang worden geweigerd met een vaste sleutel in details.fout, en er wordt niets bewaard", async () => {
    m.kv.set(SLEUTEL, { costCentres: ["PO-1"] });
    const dubbel = await stuur("POST", { naam: "po-1" });
    expect(dubbel.status).toBe(409);
    expect((await dubbel.json()).error.details).toEqual({ fout: "dubbel" });
    const leeg = await stuur("POST", { naam: "   " });
    expect(leeg.status).toBe(422);
    expect((await leeg.json()).error.details).toEqual({ fout: "leeg" });
    const lang = await stuur("POST", { naam: "x".repeat(KOSTENPLAATS_LENGTE + 1) });
    expect((await lang.json()).error.details).toEqual({ fout: "te-lang" });
    expect(bewaard()).toEqual(["PO-1"]);
    expect(m.audits).toEqual([]);
  });

  it("wijzigen: een vrije kostenplaats krijgt een andere naam en houdt zijn plek; een kostenplaats in gebruik niet", async () => {
    m.kv.set(SLEUTEL, { costCentres: ["PO-1", "PO-2", "PO-3"] });
    m.klussen = [{ kostenplaats: "PO-3", _count: { _all: 2 } }];
    const goed = await stuur("PATCH", { naam: "PO-2", nieuw: "PO-twee" });
    expect(goed.status).toBe(200);
    expect(bewaard()).toEqual(["PO-1", "PO-twee", "PO-3"]);
    expect(m.audits.map((a) => a.action)).toEqual(["employer.costcentre.renamed"]);
    const vast = await stuur("PATCH", { naam: "PO-3", nieuw: "PO-drie" });
    expect(vast.status).toBe(409);
    expect((await vast.json()).error.details).toEqual({ fout: "in-gebruik" });
    expect(bewaard()).toEqual(["PO-1", "PO-twee", "PO-3"]);
  });

  it("verwijderen: alleen als hij nergens in gebruik is; een onbekende naam is 404", async () => {
    m.kv.set(SLEUTEL, { costCentres: ["PO-1", "PO-2"] });
    m.vestigingen = [{ costCenter: "PO-2", _count: { _all: 1 } }];
    const vast = await stuur("DELETE", { naam: "PO-2" });
    expect(vast.status).toBe(409);
    expect((await vast.json()).error.details).toEqual({ fout: "in-gebruik" });
    const weg = await stuur("DELETE", { naam: "PO-1" });
    expect(weg.status).toBe(200);
    expect(bewaard()).toEqual(["PO-2"]);
    expect(m.audits.map((a) => a.action)).toEqual(["employer.costcentre.removed"]);
    const onbekend = await stuur("DELETE", { naam: "PO-9" });
    expect(onbekend.status).toBe(404);
    expect((await onbekend.json()).error.details).toEqual({ fout: "onbekend" });
  });

  it("een vestigingsmanager mag de lijst lezen maar niet wijzigen (423, geen 403: CrowdSec), en er wordt niets bewaard", async () => {
    m.principal = { userId: "u-man", email: "man@bedrijf.test", grants: [{ role: "LOCAL_MANAGER", organizationId: "tenantAAA1" }] };
    m.kv.set(SLEUTEL, { costCentres: ["PO-1"] });
    expect((await (await GET()).json()).kanBeheren).toBe(false);
    for (const [methode, body] of [["POST", { naam: "PO-2" }], ["PATCH", { naam: "PO-1", nieuw: "PO-9" }], ["DELETE", { naam: "PO-1" }]] as const) {
      const res = await stuur(methode, body);
      expect(res.status, methode).toBe(423);
      expect((await res.json()).error.code).toBe("ALLEEN_BEHEERDER");
    }
    expect(bewaard()).toEqual(["PO-1"]);
    expect(m.audits).toEqual([]);
  });

  it("onleesbare invoer geeft 422 en verandert niets", async () => {
    m.kv.set(SLEUTEL, { costCentres: ["PO-1"] });
    for (const rommel of ["geen json", { naam: 12 }, {}]) {
      const res = await stuur("POST", rommel);
      expect(res.status, JSON.stringify(rommel)).toBe(422);
    }
    expect(bewaard()).toEqual(["PO-1"]);
  });
});

describe("het scherm en de teksten", () => {
  const scherm = lees("components/werkgever/KostenplaatsBeheer.tsx");
  const pagina = lees("app/werkgever/instellingen/kostenplaatsen/page.tsx");

  it("de pagina staat op het adres dat de kaart op Instellingen noemt, en geeft de lijst van de server door", () => {
    expect(pagina).toContain("lijstKostenplaatsen(tenantId)");
    expect(pagina).toContain('kanBeheren={hasRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN")}');
    expect(pagina).toContain("<InstellingenKop");
    expect(pagina).toContain("export const dynamic");
    // geen extra export in een page.tsx (de build faalt, 20 nov)
    expect([...pagina.matchAll(/^export /gm)].length).toBe(2);
  });

  it("de kop heeft 'Nieuwe kostenplaats' rechtsboven, de dialoog heeft één veld, en na een wijziging geldt de lijst van de server", () => {
    expect(scherm).toContain("<InstellingenKop");
    expect(scherm).toContain("action={");
    expect(scherm).toContain("{k.nieuw}");
    // 23 nov 2026: de lijst en de dialoog zijn de gedeelde bouwstenen van de werkgeversapp (de dialoog is het sheet-patroon van OnderSheet)
    expect(scherm).toContain("<LijstTabel");
    expect(scherm.match(/<Dialoog\b/g)?.length).toBe(2);
    expect(scherm).toContain("onVerstuur={opslaan}");
    expect(scherm).not.toContain("<form");
    expect(lees("components/werkgever/Dialoog.tsx")).toContain("<OnderSheet");
    expect(scherm).toContain("setRijen(d.kostenplaatsen as Rij[]);");
    expect(scherm.match(/<input\b/g)?.length).toBe(1);
    expect(scherm).toContain('htmlFor="kostenplaats-naam"');
  });

  it("foutmeldingen hebben role=alert, een gelukt-melding role=status, en elke knop is minstens 44 px hoog", () => {
    expect(scherm).toContain('role="alert"');
    expect(scherm).toContain('role="status"');
    const knoppen = [...scherm.matchAll(/className="(btn-[^"]*)"/g)].map((x) => x[1] ?? "");
    expect(knoppen.length).toBeGreaterThanOrEqual(7);
    for (const k of knoppen) expect(k, k).toContain("min-h-11");
  });

  it("wijzigen en verwijderen staan uit zolang de kostenplaats in gebruik is, met de reden zichtbaar", () => {
    expect(scherm.match(/disabled=\{r\.gebruik > 0\}/g)?.length).toBe(2);
    expect(scherm).toContain("k.geblokkeerd");
  });

  it("geen servercode in de browser, en geen kleur van Tailwind zonder donkere regel", () => {
    expect(scherm).not.toMatch(/from "@\/lib\/(prisma|storage|mail|i18n\/server)|from "zod"|dictionary-en/);
    expect(scherm).not.toMatch(/(?:bg|text)-(?:red|orange|amber|yellow|green|emerald|sky|blue|violet|purple|pink|rose|slate|gray|zinc)-\d{2,3}/);
  });

  it("Engels heeft dezelfde sleutels en plaatshouders als Nederlands, een echte vertaling, en geen woord test", () => {
    const a = nl.kostenplaatsPagina as Record<string, string>;
    const b = en.kostenplaatsPagina as Record<string, string>;
    expect(Object.keys(b).sort()).toEqual(Object.keys(a).sort());
    const plaats = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort().join(",");
    for (const [sleutel, tekst] of Object.entries(a)) {
      expect(b[sleutel]?.length, sleutel).toBeGreaterThan(0);
      expect(plaats(b[sleutel] ?? ""), sleutel).toBe(plaats(tekst));
      if (tekst.split(/\s+/).length >= 6) expect(b[sleutel], `${sleutel} is niet vertaald`).not.toBe(tekst);
      expect(tekst + (b[sleutel] ?? ""), sleutel).not.toMatch(/\btest/i);
    }
    expect(nl.kostenplaatsPagina.titel).toBe("Kostenplaatsen");
    expect(en.kostenplaatsPagina.titel).toBe("Cost centres");
  });

  it("Facturen verwijst naar de nieuwe pagina in plaats van een eigen tekstvak, en bewaart de kostenplaatsen niet meer", () => {
    const f = lees("components/app/BillingPrefsForm.tsx");
    expect(f).toContain('href="/werkgever/instellingen/kostenplaatsen"');
    expect(f).not.toContain("<textarea");
    expect(f).not.toContain("costCentres }");
    expect(f).toContain("JSON.stringify({ billingEmail, splitByCostCentre: split })");
    expect(nl.billing.poBeheer).toBe("Kostenplaatsen beheren");
    expect(en.billing.poBeheer).toBe("Manage cost centres");
    // het blok op Facturen blijft staan, met de kostenplaatsen die er zijn
    expect(lees("app/werkgever/facturen/page.tsx")).toContain("<BillingPrefsForm");
  });

  it("de uitleg bij het uitzetten van een klus wijst naar de nieuwe plek", () => {
    expect(nl.newShiftForm.kostenplaatsUitleg).toContain("Instellingen → Kostenplaatsen");
    expect(en.newShiftForm.kostenplaatsUitleg).toContain("Settings → Cost centres");
  });
});
