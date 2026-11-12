import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Uitzendovereenkomst, sjabloon v2 (12 nov 2026): v1 had een verzonnen KvK-nummer (00000000) en "kantoorhoudende te Amsterdam". v2 neemt de
// gegevens van de werkgever uit één bron (lib/platform/werkgever.ts) en laat weg wat niet is ingesteld. Een al getekende v1 blijft PRECIES
// zoals getekend (zelfde tekst, pdf en referentie); wie alleen een v1 heeft, tekent opnieuw.

const h = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  werkgever: { naam: "Zekerflex, Inc.", adres: null as string | null, kvk: null as string | null, loonheffingennummer: null as string | null },
}));

vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (h.kv.has(k) ? structuredClone(h.kv.get(k)) : null),
  kvSet: async (k: string, v: unknown) => void h.kv.set(k, structuredClone(v)),
  kvAppend: async (k: string, item: unknown, keepLast = 2000) => {
    const arr = ((h.kv.get(k) as unknown[] | undefined) ?? []).slice();
    arr.push(structuredClone(item));
    h.kv.set(k, arr.length > keepLast ? arr.slice(arr.length - keepLast) : arr);
  },
  kvListEntries: async (prefix: string) => [...h.kv.entries()].filter(([k]) => k.startsWith(prefix)).map(([key, value]) => ({ key, value: structuredClone(value) })),
}));
vi.mock("@/lib/fiscal/store", () => ({ getFiscal: async () => ({ bsnLast4: "6782" }) }));
vi.mock("@/lib/payroll/uitzend-status", () => ({ getUitzendStatus: async () => ({ phase: "A", weeksWorked: 3 }) }));
vi.mock("@/lib/platform/werkgever", () => ({ werkgeverGegevens: () => ({ ...h.werkgever }) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { activeUitzendContract, listUitzendContracts, signUitzendContract, verouderdUitzendContract, voorbeeldUitzendContract, SJABLOON_HUIDIG, type UitzendContract } from "@/lib/agreements/uitzend-contract";
import { uitzendContractBlokken } from "@/lib/agreements/uitzend-tekst";
import { uitzendContractPdf } from "@/lib/pdf/documents";

const ROOT = process.cwd();
const bron = (f: string) => readFileSync(path.join(ROOT, f), "utf8").split("\r\n").join("\n");
const sha = (x: Buffer | string) => createHash("sha256").update(x).digest("hex");
const NU = new Date("2026-11-12T12:00:00+01:00").getTime();
const DAG = 86_400_000;

/** Een v1-overeenkomst precies zoals die vóór 12 nov 2026 werd getekend (geen sjabloon-veld, KvK 00000000). */
const v1: UitzendContract = {
  id: "abc123def456",
  reference: "ZF-UZO-2026-001-usr123",
  userId: "usr_1",
  workerName: "Anna Kowalska",
  workerBsnLast4: "6782",
  employerName: "Zekerflex, Inc.",
  employerKvk: "00000000",
  signedAt: "2026-11-05T09:30:00.000Z",
  validFrom: "2026-11-05T09:30:00.000Z",
  validUntil: "2027-02-05T09:30:00.000Z",
  phase: "A",
  weeksWorked: 3,
};
const tekstVan = (c: UitzendContract) => uitzendContractBlokken(c).map((b) => ("tekst" in b ? b.tekst : "")).join("\n");

beforeEach(() => {
  h.kv.clear();
  h.werkgever = { naam: "Zekerflex, Inc.", adres: null, kvk: null, loonheffingennummer: null };
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NU));
});

describe("v1 blijft precies zoals getekend", () => {
  // De hashes zijn berekend met de opbouw van vóór v2 (12 nov 2026, zelfde bytes als wat al getekend is).
  const GOLDEN_PDF = "27eb70243fc07227b59cbb13c9abb0da5085ea1191d421d2a8731a6d46a7dc1d";
  const GOLDEN_BLOKKEN = "b1fa4cb4647cc97230df6bb7f34bba64950775bd9c4405ef1332b0ab36b94c17";

  it("de pdf is byte-gelijk aan die van vóór v2", () => {
    expect(sha(uitzendContractPdf(v1).bytes)).toBe(GOLDEN_PDF);
  });

  it("de tekstblokken zijn gelijk aan die van vóór v2, met of zonder expliciet sjabloon 1", () => {
    expect(sha(JSON.stringify(uitzendContractBlokken(v1)))).toBe(GOLDEN_BLOKKEN);
    expect(sha(JSON.stringify(uitzendContractBlokken({ ...v1, sjabloon: 1 })))).toBe(GOLDEN_BLOKKEN);
  });

  it("de v1-tekst noemt nog steeds wat er toen stond (het is wat getekend is), de referentie verandert niet", () => {
    const t = tekstVan(v1);
    expect(t).toContain("kantoorhoudende te Amsterdam (KVK 00000000)");
    expect(uitzendContractPdf(v1).bytes.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("een nieuwe v2 verandert de opgeslagen v1 niet (zelfde velden, zelfde volgorde in de lijst)", async () => {
    h.kv.set("uitzend-contracts:usr_1", [{ ...v1, validUntil: new Date(NU + 30 * DAG).toISOString() }]);
    const voor = JSON.stringify((await listUitzendContracts("usr_1")).find((c) => c.id === v1.id));
    const { contract, created } = await signUitzendContract("usr_1", "Anna Kowalska");
    expect(created).toBe(true);
    expect(contract.sjabloon).toBe(SJABLOON_HUIDIG);
    const na = JSON.stringify((await listUitzendContracts("usr_1")).find((c) => c.id === v1.id));
    expect(na).toBe(voor);
  });
});

describe("v2: gegevens uit één bron, niets verzonnen", () => {
  const v2 = (over: Partial<UitzendContract> = {}): UitzendContract => ({ ...v1, sjabloon: 2, employerKvk: "", ...over });

  it("zonder adres en KvK: alleen de naam, geen 'kantoorhoudende', geen 00000000", () => {
    const t = tekstVan(v2());
    expect(t).toContain('Zekerflex, Inc., als uitzendonderneming en formeel werkgever, hierna "ZekerFlex";');
    expect(t).not.toMatch(/kantoorhoudende|00000000|KVK/);
  });

  it("met adres en KvK uit de instellingen: die komen erin, een leeg veld valt weg", () => {
    const t = tekstVan(v2({ employerAddress: "Voorbeeldstraat 1, 1234 AB Amsterdam", employerKvk: "12345678" }));
    expect(t).toContain("Zekerflex, Inc., gevestigd te Voorbeeldstraat 1, 1234 AB Amsterdam (KVK 12345678), als uitzendonderneming");
    expect(tekstVan(v2({ employerAddress: "Voorbeeldstraat 1, 1234 AB Amsterdam" }))).not.toContain("KVK");
  });

  it("de pdf van v2 verschilt van v1 en is een geldige pdf", () => {
    const pdf = uitzendContractPdf(v2());
    expect(pdf.bytes.subarray(0, 4).toString()).toBe("%PDF");
    expect(sha(pdf.bytes)).not.toBe(sha(uitzendContractPdf(v1).bytes));
  });

  it("een nieuwe overeenkomst en het voorbeeld nemen de werkgever uit werkgeverGegevens() (adres en KvK alleen als ingesteld)", async () => {
    const leeg = await signUitzendContract("u-a", "A");
    expect(leeg.contract).toMatchObject({ employerName: "Zekerflex, Inc.", employerKvk: "", sjabloon: 2 });
    expect(leeg.contract).not.toHaveProperty("employerAddress");
    h.werkgever = { naam: "Zekerflex, Inc.", adres: "Straat 1, 1000 AA Plaats", kvk: "87654321", loonheffingennummer: null };
    const vol = await voorbeeldUitzendContract("u-b", "B", new Date(NU));
    expect(vol).toMatchObject({ employerAddress: "Straat 1, 1000 AA Plaats", employerKvk: "87654321", sjabloon: 2, reference: "VOORBEELD" });
  });

  it("de vaste verzonnen waarden staan nergens meer in de code", () => {
    const s = bron("lib/agreements/uitzend-contract.ts");
    // alleen in een toelichting op v1 (zo is het getekend), nergens als waarde die een nieuwe overeenkomst krijgt
    expect(s).not.toMatch(/employerKvk:\s*"00000000"|=\s*"00000000"/);
    expect(s).not.toContain("EMPLOYER_KVK");
    expect(s).toContain("werkgeverGegevens");
  });
});

describe("alleen de huidige versie telt: opnieuw tekenen", () => {
  const geldig = (over: Partial<UitzendContract>): UitzendContract => ({ ...v1, validUntil: new Date(NU + 30 * DAG).toISOString(), ...over });

  it("alleen een geldige v1: geen actieve overeenkomst, wel een verouderde (de werker tekent opnieuw)", async () => {
    h.kv.set("uitzend-contracts:u1", [geldig({})]);
    expect(await activeUitzendContract("u1")).toBeNull();
    expect((await verouderdUitzendContract("u1"))?.id).toBe(v1.id);
  });

  it("een geldige v2 telt, ook naast een v1; dan is er niets verouderds meer", async () => {
    h.kv.set("uitzend-contracts:u2", [geldig({}), geldig({ id: "nieuw", sjabloon: 2, signedAt: "2026-11-12T10:00:00.000Z" })]);
    expect((await activeUitzendContract("u2"))?.id).toBe("nieuw");
    expect(await verouderdUitzendContract("u2")).toBeNull();
  });

  it("een verlopen v1 is niet 'verouderd' maar gewoon verlopen: niets te melden", async () => {
    h.kv.set("uitzend-contracts:u3", [{ ...v1, validUntil: new Date(NU - DAG).toISOString() }]);
    expect(await activeUitzendContract("u3")).toBeNull();
    expect(await verouderdUitzendContract("u3")).toBeNull();
  });

  it("tekenen met alleen een v1 maakt een nieuwe v2 (geen 'al getekend')", async () => {
    h.kv.set("uitzend-contracts:u4", [geldig({})]);
    const r = await signUitzendContract("u4", "A");
    expect(r.created).toBe(true);
    expect(r.contract.sjabloon).toBe(2);
    expect((await activeUitzendContract("u4"))?.id).toBe(r.contract.id);
    expect(await verouderdUitzendContract("u4")).toBeNull();
    // en een tweede keer tekenen geeft dezelfde terug
    expect((await signUitzendContract("u4", "A")).created).toBe(false);
  });

  it("de poort, de reageer-controle en Verificatie lezen activeUitzendContract: de stap 'contract' staat dus weer open", () => {
    for (const f of ["lib/onboarding/werker-poort-server.ts", "lib/fiscal/eligibility.ts", "app/dashboard/verificatie/page.tsx"]) expect(bron(f), f).toContain("activeUitzendContract");
  });
});
