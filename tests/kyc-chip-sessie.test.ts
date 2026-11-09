import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

// KV in het geheugen, met het moment van schrijven (zoals updatedAt in de database)
const kv = new Map<string, { waarde: unknown; op: number }>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (kv.has(k) ? structuredClone(kv.get(k)!.waarde) : null),
  kvSet: async (k: string, v: unknown) => void kv.set(k, { waarde: structuredClone(v), op: Date.now() }),
  kvDelete: async (k: string) => void kv.delete(k),
  kvListKeys: async (p: string) => [...kv.keys()].filter((k) => k.startsWith(p)),
  kvDeleteStale: async (p: string, voor: Date) => {
    let n = 0;
    for (const [k, r] of kv) if (k.startsWith(p) && r.op < voor.getTime() && kv.delete(k)) n++;
    return n;
  },
}));
vi.mock("@/lib/env", () => ({ env: { AUTH_SECRET: "proef-geheim-voor-de-chipsessie-test-0123456789" } }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: async () => ({ fullName: "Briando van Essen" }) } } }));

import { bewaarMrzVoorChip, chipLezing, chipSleutel, chipTekst, maskeerNaam, rondChipAf, ruimChipOp, startChipSessie, wisChipGegevens } from "@/lib/kyc/chip/sessie";
import { appKanChipLezen } from "@/lib/app-mode";
import type { MrzUitslag } from "@/lib/kyc/mrz";

// vaste klok voor de logica: geen tijdbom (AGENTS.md)
const NU = new Date("2026-11-09T12:00:00+01:00");
const later = (min: number) => new Date(NU.getTime() + min * 60_000);

const MRZ: MrzUitslag = {
  formaat: "TD1",
  soort: "ID_CARD",
  land: "NLD",
  documentnummer: "IXA12B3C4",
  nationaliteit: "NLD",
  geboortedatum: "2003-06-16",
  vervaldatum: "2034-03-12",
  geslacht: "M",
  achternaam: "VAN ESSEN",
  voornamen: "BRIANDO",
  controles: { documentnummer: true, geboortedatum: true, vervaldatum: true, totaal: true },
  geldig: true,
  volledig: true,
  verlopen: false,
};

beforeEach(() => kv.clear());

describe("chip lezen: de koppeling website → app → server", () => {
  it("zonder verse MRZ-lezing geen code", async () => {
    expect(await startChipSessie("usr_1", NU)).toBeNull();
    await bewaarMrzVoorChip("usr_1", { ...MRZ, geldig: false }, NU);
    expect(await startChipSessie("usr_1", NU)).toBeNull();
    await bewaarMrzVoorChip("usr_1", MRZ, NU);
    expect(await startChipSessie("usr_1", later(31))).toBeNull(); // na 30 minuten is de lezing te oud
  });

  it("de app krijgt met de code de sleutel (yymmdd), hooguit vijf keer", async () => {
    await bewaarMrzVoorChip("usr_1", MRZ, NU);
    const code = (await startChipSessie("usr_1", NU))!;
    expect(code).toMatch(/^usr_1\.[A-Za-z0-9_-]{32}$/);
    for (let i = 0; i < 5; i++) {
      // met de gemaskeerde accountnaam: de app laat bevestigen dat het jouw account is (review M2)
      expect(await chipSleutel(code, NU)).toEqual({ documentnummer: "IXA12B3C4", geboortedatum: "030616", vervaldatum: "340312", naam: "Briando v. E." });
    }
    expect(await chipSleutel(code, NU)).toBeNull();
  });

  it("maskeert de accountnaam: herkenbaar voor jezelf, niet voor een ander (review M2)", () => {
    expect(maskeerNaam("Briando van Essen")).toBe("Briando v. E.");
    expect(maskeerNaam("Jan")).toBe("Jan");
    expect(maskeerNaam("")).toBe("");
  });

  it("een code verloopt na tien minuten, en een verzonnen code werkt nooit", async () => {
    await bewaarMrzVoorChip("usr_1", MRZ, NU);
    const code = (await startChipSessie("usr_1", NU))!;
    expect(await chipSleutel(code, later(11))).toBeNull();
    expect(await chipSleutel("usr_1.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", NU)).toBeNull();
    expect(await chipSleutel("onzin", NU)).toBeNull();
    // een code van iemand anders met mijn userId ervoor: het geheim hoort bij de ander
    await bewaarMrzVoorChip("usr_2", MRZ, NU);
    const ander = (await startChipSessie("usr_2", NU))!;
    expect(await chipSleutel(`usr_1.${ander.split(".")[1]}`, NU)).toBeNull();
  });

  it("de uitslag: alleen het resultaat bewaard, de code is daarna op", async () => {
    await bewaarMrzVoorChip("usr_1", MRZ, NU);
    const code = (await startChipSessie("usr_1", NU))!;
    const l = await rondChipAf(code, { dg1: Buffer.from([0x61, 0x00]), sod: Buffer.from("geen zegel") }, [], NU);
    expect(l).toMatchObject({ echt: false, hashesOk: false, handtekeningOk: false });
    expect(chipTekst(l!)).toContain("medewerker");
    expect(await rondChipAf(code, { dg1: Buffer.from([0x61, 0x00]), sod: Buffer.from("x") }, [], NU)).toBeNull();
    expect(await chipLezing("usr_1", later(30))).not.toBeNull();
    expect(await chipLezing("usr_1", later(61))).toBeNull(); // na een uur te oud
  });
});

describe("chip lezen: AVG (review 9 nov, H2)", () => {
  it("alles staat verzegeld: geen documentnummer, geboortedatum of naam leesbaar in de opslag", async () => {
    await bewaarMrzVoorChip("usr_1", MRZ, NU);
    const code = (await startChipSessie("usr_1", NU))!;
    await chipSleutel(code, NU);
    await startChipSessie("usr_1", NU);
    const opslag = JSON.stringify([...kv.values()]);
    for (const geheim of ["IXA12B3C4", "2003-06-16", "030616", "2034-03-12", "340312", "VAN ESSEN", "BRIANDO"]) {
      expect(opslag).not.toContain(geheim);
    }
    // en toch gewoon te gebruiken
    expect(await chipSleutel(code, NU)).toMatchObject({ documentnummer: "IXA12B3C4" });
  });

  it("geknoeid of onleesbaar telt als niet bestaand", async () => {
    await bewaarMrzVoorChip("usr_1", MRZ, NU);
    kv.set("mrz-lezing:usr_1", { waarde: { v: "v1.knoei.knoei.knoei" }, op: Date.now() });
    expect(await startChipSessie("usr_1", NU)).toBeNull();
  });

  it("de opruimtaak wist echt wat te oud is (KV kent geen verlooptijd)", async () => {
    await bewaarMrzVoorChip("usr_1", MRZ, NU);
    const code = (await startChipSessie("usr_1", NU))!;
    await rondChipAf(code, { dg1: Buffer.from([0x61, 0x00]), sod: Buffer.from("x") }, [], NU);
    await bewaarMrzVoorChip("usr_2", MRZ, NU);
    await startChipSessie("usr_2", NU);
    // 31 minuten later: MRZ-sleutels (30 min) en sessies (10 min) weg, de uitslag (60 min) nog niet
    const gewist = await ruimChipOp(new Date(Date.now() + 31 * 60_000));
    expect(gewist).toBeGreaterThanOrEqual(3);
    expect([...kv.keys()].filter((k) => k.startsWith("mrz-lezing:") || k.startsWith("chip-sessie:"))).toEqual([]);
    expect([...kv.keys()].filter((k) => k.startsWith("chip-lezing:"))).toHaveLength(1);
    // en een uur later ook de uitslag
    await ruimChipOp(new Date(Date.now() + 61 * 60_000));
    expect(kv.size).toBe(0);
  });

  it("na de verificatie wordt alles gewist, ook ongebruikte chipsessies", async () => {
    await bewaarMrzVoorChip("usr_1", MRZ, NU);
    const code = (await startChipSessie("usr_1", NU))!;
    await rondChipAf(code, { dg1: Buffer.from([0x61, 0x00]), sod: Buffer.from("x") }, [], NU);
    await bewaarMrzVoorChip("usr_1", MRZ, NU);
    await startChipSessie("usr_1", NU); // nog een, nooit gebruikt
    await wisChipGegevens("usr_1");
    expect([...kv.keys()].filter((k) => k.includes("usr_1"))).toEqual([]);
  });

  it("de sleutel wordt alleen bewaard in de app die de chip kan lezen, niet op de website", () => {
    expect(appKanChipLezen("zf_app=1; zf_app_chip=1")).toBe(true);
    expect(appKanChipLezen("zf_app=1")).toBe(false); // oudere app
    expect(appKanChipLezen("zf_app_chip=1")).toBe(false);
    expect(appKanChipLezen("")).toBe(false); // website
    expect(appKanChipLezen(null)).toBe(false);
  });

  it("de opruimtaak staat in de cron en in de hartslagbewaking", () => {
    expect(readFileSync("deploy/cron/entrypoint.sh", "utf8")).toMatch(/\*\/15 \* \* \* \* .*\/api\/internal\/kyc\/chip-opruimen/);
    expect(readFileSync("lib/ops/heartbeat.ts", "utf8")).toContain('job: "chip-opruimen"');
  });
});
