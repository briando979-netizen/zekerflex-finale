import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ kv: new Map<string, unknown>() }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (m.kv.has(k) ? structuredClone(m.kv.get(k)) : null),
  kvDelete: async (k: string) => void m.kv.delete(k),
  kvListEntries: async (p: string, limit: number) => [...m.kv].filter(([k]) => k.startsWith(p)).slice(0, limit).map(([key, v]) => ({ key, value: structuredClone(v) })),
  kvDeleteStale: async (p: string) => {
    let n = 0;
    for (const k of [...m.kv.keys()]) if (k.startsWith(p)) (m.kv.delete(k), (n += 1));
    return n;
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { ORG_KV_REGISTER, orgSleutel } from "@/lib/privacy/org-kv";
import { exporteerOrganisatieGegevens, wisOrganisatieGegevens } from "@/lib/privacy/org-wissen";

const MODULES = ["werkbonnen", "offertes", "checklists", "voorraad", "kamers", "ritten", "lidmaatschappen", "afspraken"];
const LIB = join(process.cwd(), "lib");

describe("register van organisatie-gegevens", () => {
  it("elk KV-voorvoegsel dat een module gebruikt staat in het register (een vergeten module valt hier op)", () => {
    const bekend = new Set(ORG_KV_REGISTER.map((r) => r.voorvoegsel));
    const gebruikt = new Set<string>();
    for (const mod of MODULES) {
      for (const f of readdirSync(join(LIB, mod)).filter((n) => n.endsWith(".ts"))) {
        const tekst = readFileSync(join(LIB, mod, f), "utf8");
        // "module:soort:${…" in een sjabloontekst: de eerste twee delen van de sleutel
        for (const hit of tekst.matchAll(/`([a-z-]+:[a-z-]+:)\$\{/g)) gebruikt.add(hit[1]!);
      }
    }
    expect(gebruikt.size).toBeGreaterThan(20); // de scan vindt echt iets
    expect([...gebruikt].filter((p) => !bekend.has(p))).toEqual([]);
  });

  it("elke regel in het register wordt ook echt door een module gebruikt, en elke module staat erin", () => {
    const alles = MODULES.flatMap((mod) => readdirSync(join(LIB, mod)).filter((n) => n.endsWith(".ts")).map((f) => readFileSync(join(LIB, mod, f), "utf8"))).join("\n");
    for (const r of ORG_KV_REGISTER) expect(alles, r.voorvoegsel).toContain(`\`${r.voorvoegsel}\${`);
    expect(new Set(ORG_KV_REGISTER.map((r) => r.module))).toEqual(new Set(MODULES));
    expect(new Set(ORG_KV_REGISTER.map((r) => r.voorvoegsel)).size).toBe(ORG_KV_REGISTER.length);
  });

  it("elk voorvoegsel is een echte naamruimte (twee delen, dubbele punt aan het eind)", () => {
    for (const r of ORG_KV_REGISTER) expect(r.voorvoegsel, r.voorvoegsel).toMatch(/^[a-z][a-z-]*:[a-z-]+:$/);
  });
});

const A = "orgAAAAAA1";
const B = "orgBBBBBB2";

/** Zet van elk registervoorvoegsel één rij voor deze organisatie in de opslag. */
function vul(org: string): void {
  for (const r of ORG_KV_REGISTER) {
    if (r.soort === "verwijzing") m.kv.set(`${r.voorvoegsel}hash-${org}`, { tenantId: org });
    else m.kv.set(r.soort === "exact" ? orgSleutel(r, org) : `${orgSleutel(r, org)}x1`, { klant: { naam: "Piet" }, smtpPassword: "geheim" });
  }
}

describe("wisOrganisatieGegevens", () => {
  beforeEach(() => m.kv.clear());

  it("wist alle gegevens van de organisatie, in elk register-voorvoegsel, en laat een andere organisatie staan", async () => {
    vul(A);
    vul(B);
    const aantal = await wisOrganisatieGegevens(A);
    expect(Object.keys(aantal).sort()).toEqual([...MODULES].sort());
    expect([...m.kv.keys()].filter((k) => k.includes(A))).toEqual([]);
    expect([...m.kv.keys()].filter((k) => k.includes(B)).length).toBe(ORG_KV_REGISTER.length);
  });

  it("een organisatie met een id dat met het id van een andere begint, raakt die andere niet", async () => {
    m.kv.set("werkbonnen:item:orgAAAAAA1:x", { n: 1 });
    m.kv.set("werkbonnen:item:orgAAAAAA10:x", { n: 2 });
    m.kv.set("ritten:chauffeurs:orgAAAAAA1", { namen: ["Jan"] });
    m.kv.set("ritten:chauffeurs:orgAAAAAA10", { namen: ["Piet"] });
    await wisOrganisatieGegevens(A);
    expect([...m.kv.keys()].sort()).toEqual(["ritten:chauffeurs:orgAAAAAA10", "werkbonnen:item:orgAAAAAA10:x"]);
  });

  it("wist een openbare link alleen als hij naar deze organisatie verwijst", async () => {
    m.kv.set("offertes:token:h1", { tenantId: A, id: "o1" });
    m.kv.set("offertes:token:h2", { tenantId: B, id: "o2" });
    m.kv.set("checklist:link:h3", { tenantId: A });
    m.kv.set("afspraken:slug:kapper", { tenantId: A });
    m.kv.set("afspraken:slug:bakker", { tenantId: B });
    await wisOrganisatieGegevens(A);
    expect([...m.kv.keys()].sort()).toEqual(["afspraken:slug:bakker", "offertes:token:h2"]);
  });

  it("raakt gegevens van gebruikers en andere sleutels niet (alleen het register)", async () => {
    m.kv.set(`ritten:${A}`, { ritten: [] }); // gebruikerssleutel van de werker-app (ERASABLE_KV_PREFIXES)
    m.kv.set(`audit:${A}`, { x: 1 });
    vul(A);
    await wisOrganisatieGegevens(A);
    expect([...m.kv.keys()].sort()).toEqual([`audit:${A}`, `ritten:${A}`]);
  });

  it("weigert een leeg of vreemd organisatie-id", async () => {
    for (const t of ["", "ab", "../x", "a:b", "x".repeat(65)]) await expect(wisOrganisatieGegevens(t), t).rejects.toThrow(/geen geldige organisatie/);
    await expect(exporteerOrganisatieGegevens("")).rejects.toThrow(/geen geldige organisatie/);
  });

  it("is idempotent: een tweede keer wist niets meer en geeft geen fout", async () => {
    vul(A);
    await wisOrganisatieGegevens(A);
    expect(await wisOrganisatieGegevens(A)).toEqual({});
  });
});

describe("exporteerOrganisatieGegevens", () => {
  beforeEach(() => m.kv.clear());

  it("geeft alleen de rijen van deze organisatie, met geheimen afgeschermd en zonder openbare opzoekrijtjes", async () => {
    vul(A);
    vul(B);
    const rijen = await exporteerOrganisatieGegevens(A);
    expect(rijen.length).toBe(ORG_KV_REGISTER.filter((r) => r.soort !== "verwijzing").length);
    expect(rijen.every((r) => r.key.includes(A))).toBe(true);
    expect(JSON.stringify(rijen)).not.toContain("geheim");
    expect(rijen.some((r) => r.module === "werkbonnen" && r.omschrijving.length > 0)).toBe(true);
  });
});
