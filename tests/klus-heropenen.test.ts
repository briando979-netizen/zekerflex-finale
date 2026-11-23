import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Instellingen → Klus-instellingen (23 nov 2026, naar YoungOnes): een eigen pagina met "Klussen automatisch heropenen" (nieuw; standaard aan,
// zoals het altijd werkte), het maximum aantal uren per werker en inchecken. Maximum uren en inchecken stonden onderaan Bedrijfsprofiel.
// Hier: de regels (puur), de opslag en de API van de schakelaar (KV, geen schemawijziging), het scherm en de teksten. Het afzeggen zelf staat in
// klus-heropenen-afzeggen.test.ts, de knop om een klus weer open te zetten in klus-heropenen-knop.test.ts.

const m = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  kapot: false,
  audits: [] as { action: string; summary: string; actorUserId?: string | null; targetId?: string | null }[],
  principal: { userId: "u-beheer", email: "beheer@bedrijf.test", grants: [{ role: "HQ_ADMIN", organizationId: "tenantAAA1" }] } as { userId: string; email: string; grants: { role: string; organizationId: string }[] },
}));

vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => {
    if (m.kapot) throw new Error("opslag weg");
    return m.kv.has(k) ? structuredClone(m.kv.get(k)) : null;
  },
  kvSet: async (k: string, v: unknown) => void m.kv.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void m.kv.delete(k),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/auth", () => ({
  requirePrincipal: async () => m.principal,
  hasRole: (p: { grants: { role: string }[] }, ...rollen: string[]) => p.grants.some((g) => rollen.includes(g.role)),
}));
vi.mock("@/lib/dashboard/employer", () => ({ resolveEmployerScope: async () => ({ tenantIds: ["tenantAAA1"], branchIds: null }) }));
vi.mock("@/lib/audit", () => ({ recordAudit: async (a: { action: string; summary: string }) => void m.audits.push(a) }));

import { nl } from "@/lib/i18n/dictionaries";
import { en } from "@/lib/i18n/dictionary-en";
import {
  STANDAARD_HEROPENEN,
  blijftVolNaAfzegging,
  leesHeropenInstelling,
  statusNaAfzegging,
  statusNaHeropenen,
} from "@/lib/werkgever/heropenen-kern";
import { automatischHeropenen, getHeropenInstelling, zetAutomatischHeropenen } from "@/lib/werkgever/heropenen";
import { GET, POST } from "@/app/api/werkgever/heropenen-instelling/route";

const ROOT = process.cwd();
const lees = (f: string) => readFileSync(path.join(ROOT, f), "utf8").split("\r\n").join("\n");
const SLEUTEL = "klus:heropenen:tenantAAA1";

beforeEach(() => {
  m.kv.clear();
  m.kapot = false;
  m.audits.length = 0;
  m.principal = { userId: "u-beheer", email: "beheer@bedrijf.test", grants: [{ role: "HQ_ADMIN", organizationId: "tenantAAA1" }] };
});

describe("de regels (puur)", () => {
  it("zonder keuze gaat een klus vanzelf weer open, zoals het altijd werkte", () => {
    expect(STANDAARD_HEROPENEN).toEqual({ automatisch: true, sinds: null });
    for (const leeg of [null, undefined, {}, "uit", 0, []]) expect(leesHeropenInstelling(leeg), JSON.stringify(leeg)).toEqual(STANDAARD_HEROPENEN);
  });

  it("alleen een uitdrukkelijk 'automatisch: false' zet het uit; rommel is de standaard", () => {
    expect(leesHeropenInstelling({ automatisch: false, sinds: "2026-11-23T09:00:00.000Z" })).toEqual({ automatisch: false, sinds: "2026-11-23T09:00:00.000Z" });
    expect(leesHeropenInstelling({ automatisch: false })).toEqual({ automatisch: false, sinds: null });
    for (const rommel of [{ automatisch: "false" }, { automatisch: 0 }, { automatisch: null }, { automatisch: true }]) {
      expect(leesHeropenInstelling(rommel).automatisch, JSON.stringify(rommel)).toBe(true);
    }
  });

  it("alleen een volle klus bij een bedrijf dat het uitzette blijft staan; al het andere gaat zoals het altijd ging", () => {
    expect(blijftVolNaAfzegging("FILLED", false)).toBe(true);
    expect(blijftVolNaAfzegging("FILLED", true)).toBe(false);
    for (const status of ["OPEN", "MATCHING", "PARTIALLY_FILLED"] as const) expect(blijftVolNaAfzegging(status, false), status).toBe(false);
  });

  it("de status na een afzegging: met de schakelaar aan (de standaard) precies zoals voor 23 nov", () => {
    // voor 23 nov: geen plek meer bezet is OPEN, anders deels bezet, welke status de klus ook had
    for (const status of ["FILLED", "OPEN", "MATCHING", "PARTIALLY_FILLED"] as const) {
      expect(statusNaAfzegging(status, 0, true), `${status} zonder bezetting`).toBe("OPEN");
      expect(statusNaAfzegging(status, 1, true), `${status} met een bezette plek`).toBe("PARTIALLY_FILLED");
    }
  });

  it("de status na een afzegging met de schakelaar uit: een volle klus blijft volledig bezet, een klus die al open was verandert niet van gedrag", () => {
    expect(statusNaAfzegging("FILLED", 0, false)).toBe("FILLED");
    expect(statusNaAfzegging("FILLED", 1, false)).toBe("FILLED");
    expect(statusNaAfzegging("PARTIALLY_FILLED", 0, false)).toBe("OPEN");
    expect(statusNaAfzegging("OPEN", 0, false)).toBe("OPEN");
    expect(statusNaAfzegging("MATCHING", 1, false)).toBe("PARTIALLY_FILLED");
  });

  it("een klus weer openzetten geeft OPEN zonder bezetting en anders deels bezet", () => {
    expect(statusNaHeropenen(0)).toBe("OPEN");
    expect(statusNaHeropenen(1)).toBe("PARTIALLY_FILLED");
    expect(statusNaHeropenen(3)).toBe("PARTIALLY_FILLED");
  });
});

describe("de opslag", () => {
  it("zonder keuze: automatisch heropenen aan", async () => {
    expect(await getHeropenInstelling("tenantAAA1")).toEqual(STANDAARD_HEROPENEN);
    expect(await automatischHeropenen("tenantAAA1")).toBe(true);
  });

  it("uit: één rij voor dit bedrijf (met het moment), een ander bedrijf merkt niets; weer aan wist de rij", async () => {
    const nu = new Date("2026-11-23T10:00:00+01:00");
    expect(await zetAutomatischHeropenen("tenantAAA1", false, nu)).toEqual({ automatisch: false, sinds: "2026-11-23T09:00:00.000Z" });
    expect(m.kv.get(SLEUTEL)).toEqual({ automatisch: false, sinds: "2026-11-23T09:00:00.000Z" });
    expect(await automatischHeropenen("tenantAAA1")).toBe(false);
    expect(await automatischHeropenen("tenantBBB2")).toBe(true);
    expect(await zetAutomatischHeropenen("tenantAAA1", true)).toEqual(STANDAARD_HEROPENEN);
    expect(m.kv.has(SLEUTEL)).toBe(false);
    expect(await automatischHeropenen("tenantAAA1")).toBe(true);
  });

  it("een storing in de opslag laat het zoeken naar een vervanger nooit stilvallen (fail-open: aan)", async () => {
    m.kv.set(SLEUTEL, { automatisch: false, sinds: null });
    m.kapot = true;
    expect(await automatischHeropenen("tenantAAA1")).toBe(true);
  });
});

describe("de API: /api/werkgever/heropenen-instelling", () => {
  const post = (body: unknown) => POST(new Request("http://localhost/api/werkgever/heropenen-instelling", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));

  it("GET geeft de standaard: automatisch heropenen aan", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ automatisch: true, sinds: null });
  });

  it("uit: bewaard voor dit bedrijf, het antwoord is de stand van de server, en het staat in het auditspoor", async () => {
    const res = await post({ automatisch: false });
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.automatisch).toBe(false);
    expect(typeof d.sinds).toBe("string");
    expect(m.kv.get(SLEUTEL)).toMatchObject({ automatisch: false });
    expect(m.audits).toEqual([expect.objectContaining({ action: "klus.heropenen.uit", targetId: "tenantAAA1", actorUserId: "u-beheer" })]);
    expect(m.audits[0]?.summary).toContain("UIT");
    expect(await (await GET()).json()).toMatchObject({ automatisch: false });
  });

  it("aan: terug naar de standaard, de rij verdwijnt", async () => {
    await post({ automatisch: false });
    const res = await post({ automatisch: true });
    expect(await res.json()).toEqual({ automatisch: true, sinds: null });
    expect(m.kv.has(SLEUTEL)).toBe(false);
    expect(m.audits.map((a) => a.action)).toEqual(["klus.heropenen.uit", "klus.heropenen.aan"]);
  });

  it("alleen een beheerder wijzigt het (423, geen 403: CrowdSec), en er wordt niets bewaard", async () => {
    for (const rol of ["LOCAL_MANAGER", "DISPUTE_MANAGER", "FREELANCER"]) {
      m.principal = { userId: "u-x", email: "x@bedrijf.test", grants: [{ role: rol, organizationId: "tenantAAA1" }] };
      const res = await post({ automatisch: false });
      expect(res.status, rol).toBe(423);
      expect((await res.json()).error.code).toBe("ALLEEN_BEHEERDER");
    }
    expect(m.kv.size).toBe(0);
    expect(m.audits).toEqual([]);
  });

  it("een onbruikbare invoer wordt geweigerd en verandert niets", async () => {
    for (const rommel of [{ automatisch: "nee" }, {}, "geen json"]) {
      const res = await post(rommel);
      expect(res.status, JSON.stringify(rommel)).toBe(422);
    }
    expect(m.kv.size).toBe(0);
  });
});

describe("de pagina Klus-instellingen", () => {
  const pagina = lees("app/werkgever/instellingen/klussen/page.tsx");

  it("heeft de drie instellingen, in één kolom, onder de gedeelde kop, op het adres dat de kaart noemt", () => {
    expect(pagina).toContain("<InstellingenKop title={k.titel} />");
    expect(pagina.indexOf("<HeropenenInstelling")).toBeLessThan(pagina.indexOf("<MaxUrenInstelling"));
    expect(pagina.indexOf("<MaxUrenInstelling")).toBeLessThan(pagina.indexOf("<IncheckenInstelling"));
    expect(pagina).toContain("<MaxUrenInstelling initial={extra.maxUrenPerWerker ?? 0} />");
    expect(pagina).toContain("<IncheckenInstelling initial={incheckVereist} />");
    expect(pagina).toContain('kanBeheren={hasRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN")}');
    expect(pagina).toContain("max-w-2xl");
    expect([...pagina.matchAll(/^export /gm)].length).toBe(2);
  });

  it("maximum uren en inchecken staan niet meer onderaan Bedrijfsprofiel (één plek), de rest van de bedrijfspagina blijft", () => {
    const bedrijf = lees("app/werkgever/bedrijf/page.tsx");
    for (const weg of ["<MaxUrenInstelling", "<IncheckenInstelling", "incheckenVereist", "maxUrenTitel", "incheckTitel"]) expect(bedrijf, weg).not.toContain(weg);
    for (const blijft of ["<OrgProfileForm", "<VolumeCard />", "<FastPaySettings />", "<MailPrefsToggles", 'id="notificaties"']) expect(bedrijf, blijft).toContain(blijft);
    // Inchecken heeft de keuze ook zelf, zoals eerst
    expect(lees("app/werkgever/inchecken/page.tsx")).toContain("<IncheckenInstelling initial={vereist} />");
  });

  it("de opslag van maximum uren en inchecken is niet veranderd: dezelfde routes, dezelfde componenten", () => {
    expect(lees("components/werkgever/MaxUrenInstelling.tsx")).toContain('fetch("/api/orgs", { method: "PUT"');
    expect(lees("components/werkgever/IncheckenInstelling.tsx")).toContain('fetch("/api/werkgever/incheck-instelling", { method: "POST"');
    expect(lees("app/api/orgs/route.ts")).toContain("maxUrenPerWerker: z.number().int().min(0).max(MAX_UREN_HOOGSTE).optional()");
  });
});

describe("de schakelaar", () => {
  const schakelaar = lees("components/werkgever/HeropenenInstelling.tsx");

  it("is een echte schakelaar met een naam, een uitleg en een tikdoel van minstens 44 px", () => {
    // 23 nov 2026: de schakelaar zelf is het gedeelde onderdeel van de werkgeversapp; dit scherm geeft de naam, de uitleg en de stand door
    const gedeeld = lees("components/werkgever/Schakelaar.tsx");
    expect(gedeeld).toContain('role="switch"');
    expect(gedeeld).toContain("aria-checked={aan}");
    expect(gedeeld).toContain("aria-label={label}");
    expect(gedeeld).toContain("aria-describedby={beschrijvingId}");
    expect(gedeeld).toContain("min-h-11");
    expect(gedeeld).toContain("disabled={uit}");
    expect(schakelaar).toContain("<Schakelaar");
    expect(schakelaar).toContain("label={c.heropenenTitel}");
    expect(schakelaar).toContain('beschrijvingId="heropenen-uitleg"');
    expect(schakelaar).toContain('id="heropenen-uitleg"');
    expect(schakelaar).toContain("uit={bezig || !kanBeheren}");
  });

  it("bewaart meteen en neemt de stand van de server over; een fout is role=alert, een gelukt-melding role=status", () => {
    expect(schakelaar).toContain('fetch("/api/werkgever/heropenen-instelling", { method: "POST"');
    expect(schakelaar).toContain("JSON.stringify({ automatisch: !aan })");
    expect(schakelaar).toContain("const nu = d?.automatisch !== false;");
    expect(schakelaar).toContain("setAan(nu);");
    expect(schakelaar).toContain('role={melding.ok ? "status" : "alert"}');
  });

  it("laadt geen servercode in de browser", () => {
    expect(schakelaar).not.toMatch(/from "@\/lib\/(prisma|storage|mail|i18n\/server)|from "zod"|dictionary-en/);
  });
});

describe("de teksten, in Nederlands en Engels", () => {
  const PLAATS = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort().join(",");

  it.each(["klusInstellingen", "klusWeerOpen"] as const)("%s: dezelfde sleutels en plaatshouders, een echte vertaling en geen woord test", (sectie) => {
    const a = nl[sectie] as Record<string, string>;
    const b = en[sectie] as Record<string, string>;
    expect(Object.keys(b).sort()).toEqual(Object.keys(a).sort());
    for (const [sleutel, tekst] of Object.entries(a)) {
      expect(b[sleutel]?.length, sleutel).toBeGreaterThan(0);
      expect(PLAATS(b[sleutel] ?? ""), sleutel).toBe(PLAATS(tekst));
      if (tekst.split(/\s+/).length >= 6) expect(b[sleutel], `${sleutel} is niet vertaald`).not.toBe(tekst);
      expect(tekst + (b[sleutel] ?? ""), sleutel).not.toMatch(/\btest/i);
    }
  });

  it("de uitleg zegt wat Aan en Uit doen, in gewone taal, en belooft niets wat niet kan", () => {
    expect(nl.klusInstellingen.titel).toBe("Klus-instellingen");
    expect(en.klusInstellingen.titel).toBe("Job settings");
    expect(nl.klusInstellingen.heropenenTitel).toBe("Klussen automatisch heropenen");
    expect(nl.klusInstellingen.heropenenUitleg).toContain("zoekt ZekerFlex een vervanger");
    expect(nl.klusInstellingen.heropenenUitleg).toContain("zet je hem zelf weer open");
    expect(en.klusInstellingen.heropenenUitleg).toContain("looks for a replacement");
  });
});

describe("de kaarten op Instellingen wijzen naar pagina's die bestaan", () => {
  it("elk adres van een kaart in de app is een pagina (met of zonder anker)", () => {
    const pagina = lees("app/werkgever/instellingen/page.tsx");
    const adressen = [...pagina.matchAll(/href: "(\/werkgever\/[a-z0-9/-]+)(?:#[a-z-]+)?"/g)].map((x) => x[1] ?? "");
    expect(adressen.length).toBeGreaterThan(10);
    for (const adres of new Set(adressen)) {
      expect(existsSync(path.join(ROOT, "app", ...adres.split("/").filter(Boolean), "page.tsx")), adres).toBe(true);
    }
    expect(adressen).toContain("/werkgever/instellingen/kostenplaatsen");
    expect(adressen).toContain("/werkgever/instellingen/klussen");
  });
});
