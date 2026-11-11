import { beforeEach, describe, expect, it, vi } from "vitest";

// De opslag draait in dit bestand op een gewone Map: dezelfde functies als lib/storage/kv, zonder database.
const m = vi.hoisted(() => ({ kv: new Map<string, unknown>() }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (m.kv.has(k) ? structuredClone(m.kv.get(k)) : null),
  kvSet: async (k: string, v: unknown) => void m.kv.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void m.kv.delete(k),
  kvListValues: async (p: string, limit: number) => [...m.kv].filter(([k]) => k.startsWith(p)).slice(0, limit).map(([, v]) => structuredClone(v)),
  kvListEntries: async (p: string, limit: number) => [...m.kv].filter(([k]) => k.startsWith(p)).slice(0, limit).map(([key, v]) => ({ key, value: structuredClone(v) })),
}));

import { bewerkArtikel, geschiedenis, leesArtikel, leesArtikelen, maakArtikel, muteer, verwijderArtikel, zetArchief } from "@/lib/voorraad/store";

const NU = new Date("2026-11-12T06:00:00Z");
const na = (sec: number) => new Date(NU.getTime() + sec * 1000);
const basis = { naam: "Schroeven 4x40", eenheid: "doos", aantal: 5, minimum: 2 };

const fout = async (p: Promise<unknown>): Promise<{ status: number; message: string }> => {
  try {
    await p;
  } catch (e) {
    return e as { status: number; message: string };
  }
  return { status: 0, message: "" };
};

beforeEach(() => m.kv.clear());

describe("artikelen", () => {
  it("maakt een artikel met een beginaantal zonder logregel en vindt het terug", async () => {
    const a = await maakArtikel("t1", basis, NU);
    expect(a).toMatchObject({ naam: "Schroeven 4x40", aantal: 5, begin: 5, gearchiveerd: false });
    expect((await leesArtikel("t1", a.id))?.id).toBe(a.id);
    expect(await geschiedenis("t1", a.id)).toEqual([]);
  });

  it("artikelnummer is uniek per organisatie, hoofdletterongevoelig, en andere organisaties botsen niet", async () => {
    await maakArtikel("t1", { ...basis, sku: "AB-1" }, NU);
    const dubbel = await fout(maakArtikel("t1", { ...basis, naam: "Ander", sku: "ab-1" }, NU));
    expect(dubbel.status).toBe(409);
    await maakArtikel("t1", { ...basis, naam: "Zonder 1" }, NU);
    await maakArtikel("t1", { ...basis, naam: "Zonder 2" }, NU); // leeg nummer mag vaker
    await maakArtikel("t2", { ...basis, sku: "ab-1" }, NU);
    expect(await leesArtikelen("t1")).toHaveLength(3);
  });

  it("een andere organisatie ziet en wijzigt het artikel niet", async () => {
    const a = await maakArtikel("t1", basis, NU);
    expect(await leesArtikelen("t2")).toEqual([]);
    expect(await leesArtikel("t2", a.id)).toBeNull();
    expect((await fout(muteer("t2", a.id, { reden: "inkoop", hoeveelheid: 1 }, "u1", NU))).status).toBe(404);
    expect((await fout(verwijderArtikel("t2", a.id))).status).toBe(404);
    expect((await fout(bewerkArtikel("t2", a.id, basis, NU))).status).toBe(404);
    expect((await fout(zetArchief("t2", a.id, true, NU))).status).toBe(404);
  });

  it("ongeldige id's (ook constructor of een pad) geven niet gevonden", async () => {
    for (const id of ["constructor", "../x", "", "ZZZZZZZZZZZZ", "aaaa"]) {
      expect(await leesArtikel("t1", id)).toBeNull();
      expect((await fout(muteer("t1", id, { reden: "inkoop", hoeveelheid: 1 }, "u1", NU))).status).toBe(404);
      expect(await geschiedenis("t1", id)).toEqual([]);
    }
  });

  it("bewerken laat het aantal staan en controleert het artikelnummer tegen andere artikelen", async () => {
    const a = await maakArtikel("t1", { ...basis, sku: "A1" }, NU);
    const b = await maakArtikel("t1", { ...basis, naam: "Pluggen", sku: "B1" }, NU);
    const nieuw = await bewerkArtikel("t1", a.id, { ...basis, sku: "a1", aantal: 999, naam: "Schroeven nieuw" }, na(5));
    expect(nieuw).toMatchObject({ naam: "Schroeven nieuw", aantal: 5, sku: "a1" });
    expect((await fout(bewerkArtikel("t1", b.id, { ...basis, naam: "Pluggen", sku: "A1" }, NU))).status).toBe(409);
  });

  it("naar een eenheid zonder decimalen kan alleen bij een heel aantal", async () => {
    const a = await maakArtikel("t1", { naam: "Verf", eenheid: "liter", aantal: "2,5", minimum: 0 }, NU);
    expect((await fout(bewerkArtikel("t1", a.id, { naam: "Verf", eenheid: "stuk" }, NU))).status).toBe(422);
  });
});

describe("mutaties", () => {
  it("elke mutatie is een logregel met verschil, nieuw aantal, reden, opmerking, gebruikers-id en tijd", async () => {
    const a = await maakArtikel("t1", basis, NU);
    const r = await muteer("t1", a.id, { reden: "verkoop", hoeveelheid: 2, opmerking: "Klant Jan" }, "u1", na(10));
    expect(r.artikel.aantal).toBe(3);
    expect(r.mutatie).toMatchObject({ artikelId: a.id, verschil: -2, nieuwAantal: 3, reden: "verkoop", opmerking: "Klant Jan", door: "u1", op: na(10).toISOString() });
    expect(Object.keys(r.mutatie).sort()).toEqual(["artikelId", "door", "id", "nieuwAantal", "op", "opmerking", "reden", "verschil"]);
    expect((await leesArtikel("t1", a.id))?.aantal).toBe(3);
  });

  it("het aantal onder nul mag niet, behalve met een correctie", async () => {
    const a = await maakArtikel("t1", { ...basis, aantal: 1 }, NU);
    expect((await fout(muteer("t1", a.id, { reden: "gebruikt", hoeveelheid: 2 }, "u1", NU))).status).toBe(422);
    expect((await leesArtikel("t1", a.id))?.aantal).toBe(1);
    expect(await geschiedenis("t1", a.id)).toEqual([]);
    const r = await muteer("t1", a.id, { reden: "correctie", hoeveelheid: -3 }, "u1", na(1));
    expect(r.artikel.aantal).toBe(-2);
  });

  it("een telling zet een absolute waarde en logt het verschil", async () => {
    const a = await maakArtikel("t1", basis, NU);
    const r = await muteer("t1", a.id, { reden: "telling", hoeveelheid: 9 }, "u1", na(1));
    expect(r.mutatie).toMatchObject({ verschil: 4, nieuwAantal: 9 });
    expect(r.artikel.aantal).toBe(9);
  });

  it("decimalen bij liters tellen goed op, bij stuks worden ze geweigerd", async () => {
    const l = await maakArtikel("t1", { naam: "Shampoo", eenheid: "liter", aantal: "0,1", minimum: 0 }, NU);
    const r = await muteer("t1", l.id, { reden: "inkoop", hoeveelheid: "0,2" }, "u1", na(1));
    expect(r.artikel.aantal).toBe(0.3);
    const s = await maakArtikel("t1", { naam: "Kam", eenheid: "stuk", aantal: 3, minimum: 0 }, NU);
    expect((await fout(muteer("t1", s.id, { reden: "inkoop", hoeveelheid: "1,5" }, "u1", NU))).status).toBe(422);
  });

  it("gelijktijdige mutaties raken elkaar niet kwijt: het aantal volgt het logboek", async () => {
    const a = await maakArtikel("t1", { ...basis, aantal: 10 }, NU);
    const t = new Date(NU.getTime() + 1000);
    await Promise.all([muteer("t1", a.id, { reden: "verkoop", hoeveelheid: 3 }, "u1", t), muteer("t1", a.id, { reden: "inkoop", hoeveelheid: 5 }, "u2", t), muteer("t1", a.id, { reden: "gebruikt", hoeveelheid: 1 }, "u3", t)]);
    expect((await leesArtikel("t1", a.id))?.aantal).toBe(11);
    expect(await geschiedenis("t1", a.id)).toHaveLength(3);
  });

  it("twee gelijktijdige verkopen die samen te veel zijn: de tweede wordt teruggedraaid", async () => {
    const a = await maakArtikel("t1", { ...basis, aantal: 3 }, NU);
    const t = new Date(NU.getTime() + 1000);
    const uitkomst = await Promise.allSettled([muteer("t1", a.id, { reden: "verkoop", hoeveelheid: 2 }, "u1", t), muteer("t1", a.id, { reden: "verkoop", hoeveelheid: 2 }, "u2", t)]);
    const aantalAfgewezen = uitkomst.filter((u) => u.status === "rejected").length;
    const eind = (await leesArtikel("t1", a.id))?.aantal ?? -99;
    expect(eind).toBeGreaterThanOrEqual(0);
    expect(aantalAfgewezen + (await geschiedenis("t1", a.id)).length).toBe(2);
  });

  it("geschiedenis: nieuwste eerst, hoogstens 100", async () => {
    const a = await maakArtikel("t1", basis, NU);
    for (let i = 0; i < 105; i += 1) await muteer("t1", a.id, { reden: "inkoop", hoeveelheid: 1 }, "u1", na(i + 1));
    const g = await geschiedenis("t1", a.id);
    expect(g).toHaveLength(100);
    expect(g[0]!.nieuwAantal).toBe(110);
    expect(g[99]!.nieuwAantal).toBe(11);
    expect((await leesArtikel("t1", a.id))?.aantal).toBe(110);
  });

  it("de geschiedenis van een artikel bevat alleen zijn eigen regels", async () => {
    const a = await maakArtikel("t1", basis, NU);
    const b = await maakArtikel("t1", { ...basis, naam: "Pluggen" }, NU);
    await muteer("t1", a.id, { reden: "inkoop", hoeveelheid: 1 }, "u1", na(1));
    await muteer("t1", b.id, { reden: "inkoop", hoeveelheid: 1 }, "u1", na(2));
    expect(await geschiedenis("t1", a.id)).toHaveLength(1);
    expect(await geschiedenis("t2", a.id)).toEqual([]);
  });
});

describe("archiveren en wissen", () => {
  it("wissen kan zonder mutaties; met mutaties niet (dan archiveren)", async () => {
    const schoon = await maakArtikel("t1", basis, NU);
    await verwijderArtikel("t1", schoon.id);
    expect(await leesArtikel("t1", schoon.id)).toBeNull();
    const a = await maakArtikel("t1", { ...basis, naam: "Met log" }, NU);
    await muteer("t1", a.id, { reden: "inkoop", hoeveelheid: 1 }, "u1", na(1));
    expect((await fout(verwijderArtikel("t1", a.id))).status).toBe(409);
    expect(await leesArtikel("t1", a.id)).not.toBeNull();
  });

  it("archiveren houdt de geschiedenis, blokkeert mutaties en is terug te halen", async () => {
    const a = await maakArtikel("t1", basis, NU);
    await muteer("t1", a.id, { reden: "inkoop", hoeveelheid: 1 }, "u1", na(1));
    const arch = await zetArchief("t1", a.id, true, na(2));
    expect(arch.gearchiveerd).toBe(true);
    expect(await geschiedenis("t1", a.id)).toHaveLength(1);
    expect((await fout(muteer("t1", a.id, { reden: "inkoop", hoeveelheid: 1 }, "u1", na(3)))).status).toBe(409);
    const terug = await zetArchief("t1", a.id, false, na(4));
    expect(terug.gearchiveerd).toBe(false);
    expect((await muteer("t1", a.id, { reden: "inkoop", hoeveelheid: 1 }, "u1", na(5))).artikel.aantal).toBe(7);
  });
});
