import { beforeEach, describe, expect, it, vi } from "vitest";

// KV in het geheugen
const kv = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (kv.has(k) ? structuredClone(kv.get(k)) : null),
  kvSet: async (k: string, v: unknown) => void kv.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void kv.delete(k),
}));

import { bewaarMrzVoorChip, chipLezing, chipSleutel, chipTekst, rondChipAf, startChipSessie, wisChipGegevens } from "@/lib/kyc/chip/sessie";
import type { MrzUitslag } from "@/lib/kyc/mrz";

// vaste klok: geen tijdbom (AGENTS.md)
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
      expect(await chipSleutel(code, NU)).toEqual({ documentnummer: "IXA12B3C4", geboortedatum: "030616", vervaldatum: "340312" });
    }
    expect(await chipSleutel(code, NU)).toBeNull();
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
    // nergens ruwe chipbestanden of het BSN in de opslag
    expect(JSON.stringify([...kv.values()])).not.toMatch(/999999990|geen zegel/);
  });

  it("na de verificatie wordt alles gewist", async () => {
    await bewaarMrzVoorChip("usr_1", MRZ, NU);
    const code = (await startChipSessie("usr_1", NU))!;
    await rondChipAf(code, { dg1: Buffer.from([0x61, 0x00]), sod: Buffer.from("x") }, [], NU);
    await wisChipGegevens("usr_1");
    expect([...kv.keys()].filter((k) => k.includes("usr_1"))).toEqual([]);
  });
});
