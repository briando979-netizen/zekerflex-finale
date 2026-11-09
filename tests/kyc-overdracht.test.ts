import { beforeEach, describe, expect, it, vi } from "vitest";

// KV en de uploadopslag in het geheugen
const kv = new Map<string, unknown>();
const uploads = new Map<string, { bytes: Buffer; filename: string; mimeType: string }>();
let volgnummer = 0;
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (kv.has(k) ? structuredClone(kv.get(k)) : null),
  kvSet: async (k: string, v: unknown) => void kv.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void kv.delete(k),
  kvListEntries: async (p: string) => [...kv.entries()].filter(([k]) => k.startsWith(p)).map(([key, value]) => ({ key, value })),
}));
vi.mock("@/lib/storage/local", () => ({
  storeUpload: async (i: { bytes: Buffer; filename: string; mimeType: string }) => {
    const id = `up_${++volgnummer}`;
    uploads.set(id, { bytes: i.bytes, filename: i.filename, mimeType: i.mimeType });
    return { id };
  },
  readUpload: async (id: string) => uploads.get(id)!,
  deleteUpload: async (id: string) => void uploads.delete(id),
}));
vi.mock("@/lib/env", () => ({ env: { AUTH_SECRET: "proef-geheim-voor-de-overdracht-test-0123456789" } }));

import { leverOverdrachtIn, maakOverdracht, openOverdracht, overdrachtGegevens, overdrachtGeldig, overdrachtStatus, pakOverdracht, ruimOverdrachtOp } from "@/lib/kyc/overdracht";

// vaste klok: geen tijdbom (AGENTS.md)
const NU = new Date("2026-11-09T12:00:00+01:00");
const later = (min: number) => new Date(NU.getTime() + min * 60_000);
const foto = (naam: string) => ({ filename: `${naam}.jpg`, mimeType: "image/jpeg", bytes: Buffer.from(`foto-${naam}`) });
const INLEVERING = {
  soort: "ID_CARD" as const,
  gegevens: { nummer: "IXA12B3C4", datum: "2034-03-12", naam: "Briando van Essen" },
  voor: foto("voor"),
  achter: foto("achter"),
  selfie: foto("selfie"),
};

beforeEach(() => {
  kv.clear();
  uploads.clear();
  volgnummer = 0;
});

describe("verder op je telefoon (QR)", () => {
  it("een code: de laptop ziet wacht → geopend → klaar", async () => {
    const code = await maakOverdracht("usr_1", NU);
    expect(code).toMatch(/^usr_1\.[A-Za-z0-9_-]{32}$/);
    expect(await overdrachtStatus("usr_1", NU)).toEqual({ status: "wacht" });
    expect(await openOverdracht(code, NU)).toEqual({ userId: "usr_1" });
    expect(await overdrachtStatus("usr_1", NU)).toEqual({ status: "geopend" });
    expect(await leverOverdrachtIn(code, INLEVERING, NU)).toBe(true);
    expect(await overdrachtStatus("usr_1", NU)).toEqual({ status: "klaar", soort: "ID_CARD" });
  });

  it("een verzonnen of andermans code werkt nooit, en na 20 minuten is de code verlopen", async () => {
    const code = await maakOverdracht("usr_1", NU);
    expect(await openOverdracht("usr_1.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", NU)).toBeNull();
    expect(await openOverdracht("onzin", NU)).toBeNull();
    const ander = await maakOverdracht("usr_2", NU);
    expect(await openOverdracht(`usr_1.${ander.split(".")[1]}`, NU)).toBeNull();
    expect(await overdrachtGeldig(code, later(21))).toBeNull();
    expect(await overdrachtStatus("usr_1", later(21))).toEqual({ status: "verlopen" });
  });

  it("inleveren kan maar één keer", async () => {
    const code = await maakOverdracht("usr_1", NU);
    expect(await leverOverdrachtIn(code, INLEVERING, NU)).toBe(true);
    expect(await leverOverdrachtIn(code, INLEVERING, NU)).toBe(false);
    expect(await overdrachtGeldig(code, NU)).toBeNull();
  });

  it("de laptop bekijkt eerst de gegevens, haalt dan de foto's op; daarna is alles weg", async () => {
    const code = await maakOverdracht("usr_1", NU);
    await leverOverdrachtIn(code, INLEVERING, NU);
    expect(await overdrachtGegevens("usr_1")).toEqual({ soort: "ID_CARD", gegevens: INLEVERING.gegevens });
    expect(uploads.size).toBe(3); // bekijken maakt niets op
    const p = await pakOverdracht("usr_1");
    expect(p?.voor.bytes.toString()).toBe("foto-voor");
    expect(p?.selfie.bytes.toString()).toBe("foto-selfie");
    expect(uploads.size).toBe(0);
    expect(kv.size).toBe(0);
    expect(await pakOverdracht("usr_1")).toBeNull();
  });

  it("een nieuwe code vervangt de oude, met zijn foto's", async () => {
    const oud = await maakOverdracht("usr_1", NU);
    await leverOverdrachtIn(oud, INLEVERING, NU);
    const nieuw = await maakOverdracht("usr_1", NU);
    expect(uploads.size).toBe(0);
    expect(await openOverdracht(oud, NU)).toBeNull();
    expect(await openOverdracht(nieuw, NU)).toEqual({ userId: "usr_1" });
  });

  it("de opruimtaak wist wat te lang blijft liggen, met de foto's", async () => {
    const code = await maakOverdracht("usr_1", NU);
    await leverOverdrachtIn(code, INLEVERING, NU);
    await maakOverdracht("usr_2", later(25));
    expect(await ruimOverdrachtOp(later(31))).toBe(1); // alleen die van usr_1 (31 min oud)
    expect(uploads.size).toBe(0);
    expect([...kv.keys()]).toEqual(["id-overdracht:usr_2"]);
  });

  it("niets leesbaar in de opslag: geen documentnummer, naam of geheim", async () => {
    const code = await maakOverdracht("usr_1", NU);
    await leverOverdrachtIn(code, INLEVERING, NU);
    const opslag = JSON.stringify([...kv.values()]);
    for (const geheim of ["IXA12B3C4", "Briando", "2034-03-12", code.split(".")[1]!]) expect(opslag).not.toContain(geheim);
  });
});
