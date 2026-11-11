import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const kv = vi.hoisted(() => new Map<string, unknown>());

vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (kv.has(k) ? structuredClone(kv.get(k)) : null),
  kvSet: async (k: string, v: unknown) => void kv.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void kv.delete(k),
  kvListValues: async (p: string, limit: number) => [...kv].filter(([k]) => k.startsWith(p)).slice(0, limit).map(([, v]) => structuredClone(v)),
  kvListEntries: async (p: string, limit: number) => [...kv].filter(([k]) => k.startsWith(p)).slice(0, limit).map(([key, v]) => ({ key, value: structuredClone(v) })),
}));

import {
  bewaarChauffeurs,
  bewerkVoertuig,
  leesChauffeurs,
  leesRit,
  leesVoertuigen,
  lijstRitten,
  maakVoertuig,
  nieuweRit,
  verwijderRit,
  wijzigRit,
  wisChauffeur,
  wisKlant,
  zetStatus,
  zetVoertuigArchief,
} from "@/lib/ritten/store";

const invoer = (over: Record<string, unknown> = {}) => ({ start: "2026-11-05T09:00", eind: "2026-11-05T11:00", van: "Rotterdam", naar: "Utrecht", klantNaam: "Jansen BV", ...over });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-12T06:00:00Z"));
  kv.clear();
});
afterEach(() => vi.useRealTimers());

describe("voertuigen", () => {
  it("maakt een voertuig met genormaliseerd kenteken en houdt het per organisatie apart", async () => {
    const v = await maakVoertuig("t1", { kenteken: "ab-12-cd", omschrijving: "Bestelbus" });
    expect(v.kenteken).toBe("AB12CD");
    expect(await leesVoertuigen("t1")).toHaveLength(1);
    expect(await leesVoertuigen("t2")).toHaveLength(0);
  });
  it("een dubbel kenteken (ook met streepjes of kleine letters) is een conflict, ook als het eerste gearchiveerd is", async () => {
    const v = await maakVoertuig("t1", { kenteken: "AB12CD", omschrijving: "Bestelbus" });
    await expect(maakVoertuig("t1", { kenteken: "ab-12-cd", omschrijving: "Andere" })).rejects.toMatchObject({ status: 409 });
    await zetVoertuigArchief("t1", v.id, true);
    await expect(maakVoertuig("t1", { kenteken: "AB 12 CD", omschrijving: "Andere" })).rejects.toMatchObject({ status: 409 });
  });
  it("hetzelfde kenteken mag wel bij een andere organisatie", async () => {
    await maakVoertuig("t1", { kenteken: "AB12CD", omschrijving: "Bestelbus" });
    await expect(maakVoertuig("t2", { kenteken: "AB12CD", omschrijving: "Bestelbus" })).resolves.toMatchObject({ kenteken: "AB12CD" });
  });
  it("bewerken laat het eigen kenteken toe maar niet dat van een ander", async () => {
    const a = await maakVoertuig("t1", { kenteken: "AB12CD", omschrijving: "Bus A" });
    const b = await maakVoertuig("t1", { kenteken: "XY99ZZ", omschrijving: "Bus B" });
    expect(await bewerkVoertuig("t1", a.id, { kenteken: "AB-12-CD", omschrijving: "Bus A2", apk: "2027-01-01" })).toMatchObject({ omschrijving: "Bus A2", apk: "2027-01-01" });
    await expect(bewerkVoertuig("t1", b.id, { kenteken: "AB12CD", omschrijving: "Bus B" })).rejects.toMatchObject({ status: 409 });
  });
  it("een voertuig van een andere organisatie of met een rare id bestaat niet", async () => {
    const a = await maakVoertuig("t1", { kenteken: "AB12CD", omschrijving: "Bus" });
    await expect(bewerkVoertuig("t2", a.id, { kenteken: "AB12CD", omschrijving: "Bus" })).rejects.toMatchObject({ status: 404 });
    await expect(zetVoertuigArchief("t1", "constructor", true)).rejects.toMatchObject({ status: 404 });
  });
  it("een ongeldig kenteken geeft 422", async () => {
    await expect(maakVoertuig("t1", { kenteken: "ABC", omschrijving: "Bus" })).rejects.toMatchObject({ status: 422 });
  });
});

describe("chauffeurs", () => {
  it("bewaart de lijst per organisatie", async () => {
    expect(await bewaarChauffeurs("t1", { namen: ["Piet", "Kees"] })).toEqual(["Piet", "Kees"]);
    expect(await leesChauffeurs("t1")).toEqual(["Piet", "Kees"]);
    expect(await leesChauffeurs("t2")).toEqual([]);
  });
  it("een naam wissen vervangt hem in alle ritten van de organisatie en laat andere organisaties met rust", async () => {
    await bewaarChauffeurs("t1", { namen: ["Piet", "Kees"] });
    await bewaarChauffeurs("t2", { namen: ["Piet"] });
    const a = await nieuweRit("t1", invoer({ chauffeur: "Piet" }));
    const b = await nieuweRit("t1", invoer({ chauffeur: "Kees" }));
    const c = await nieuweRit("t2", invoer({ chauffeur: "Piet" }));
    const r = await wisChauffeur("t1", "piet");
    expect(r).toEqual({ ritten: 1, chauffeurs: ["Kees"] });
    expect((await leesRit("t1", a.rit.id))?.chauffeur).toBe("Verwijderd");
    expect((await leesRit("t1", b.rit.id))?.chauffeur).toBe("Kees");
    expect((await leesRit("t2", c.rit.id))?.chauffeur).toBe("Piet");
    expect(await leesChauffeurs("t1")).toEqual(["Kees"]);
    expect(await leesChauffeurs("t2")).toEqual(["Piet"]);
  });
  it("een onbekende naam of een lege naam geeft een fout", async () => {
    await expect(wisChauffeur("t1", "Niemand")).rejects.toMatchObject({ status: 404 });
    await expect(wisChauffeur("t1", "  ")).rejects.toMatchObject({ status: 422 });
    await expect(wisChauffeur("t1", 5)).rejects.toMatchObject({ status: 422 });
  });
});

describe("ritten", () => {
  it("geeft volgnummers per jaar vanaf 0001 en houdt organisaties apart", async () => {
    const a = await nieuweRit("t1", invoer());
    const b = await nieuweRit("t1", invoer());
    const c = await nieuweRit("t2", invoer());
    expect([a.rit.nummer, b.rit.nummer, c.rit.nummer]).toEqual(["R-2026-0001", "R-2026-0002", "R-2026-0001"]);
    expect(a.rit.id).toBe("2026-0001");
    expect(a.rit.status).toBe("gepland");
    expect(a.rit.start).toBe("2026-11-05T08:00:00.000Z");
  });
  it("begint een nieuw jaar weer bij 0001 (Nederlands jaar: 31 december 23:30 UTC is al 2027)", async () => {
    await nieuweRit("t1", invoer());
    const r = await nieuweRit("t1", invoer(), new Date("2026-12-31T23:30:00Z"));
    expect(r.rit.nummer).toBe("R-2027-0001");
  });
  it("geeft geen dubbele nummers bij gelijktijdig aanmaken", async () => {
    const klaar = await Promise.all(Array.from({ length: 8 }, () => nieuweRit("t1", invoer())));
    const nummers = klaar.map((k) => k.rit.nummer);
    expect(new Set(nummers).size).toBe(8);
    expect((await lijstRitten("t1")).map((r) => r.nummer).sort()).toEqual(nummers.slice().sort());
  });
  it("hergebruikt het nummer van een verwijderde rit niet", async () => {
    const a = await nieuweRit("t1", invoer());
    await verwijderRit("t1", a.rit.id);
    expect((await nieuweRit("t1", invoer())).rit.nummer).toBe("R-2026-0002");
  });
  it("weigert einde voor begin en onzin met 422", async () => {
    await expect(nieuweRit("t1", invoer({ eind: "2026-11-05T08:00" }))).rejects.toMatchObject({ status: 422 });
    await expect(nieuweRit("t1", invoer({ van: "" }))).rejects.toMatchObject({ status: 422 });
    await expect(nieuweRit("t1", null)).rejects.toMatchObject({ status: 422 });
    expect(await lijstRitten("t1")).toHaveLength(0);
  });
  it("een rit over middernacht mag", async () => {
    const r = await nieuweRit("t1", invoer({ start: "2026-11-05T22:00", eind: "2026-11-06T04:00" }));
    expect(r.rit.eind).toBe("2026-11-06T03:00:00.000Z");
  });
  it("een voertuig of chauffeur van een andere organisatie kan niet gekozen worden", async () => {
    const v = await maakVoertuig("t2", { kenteken: "AB12CD", omschrijving: "Bus" });
    await bewaarChauffeurs("t2", { namen: ["Piet"] });
    await expect(nieuweRit("t1", invoer({ voertuigId: v.id }))).rejects.toMatchObject({ status: 422 });
    await expect(nieuweRit("t1", invoer({ chauffeur: "Piet" }))).rejects.toMatchObject({ status: 422 });
    await expect(nieuweRit("t1", invoer({ voertuigId: "constructor" }))).rejects.toMatchObject({ status: 422 });
  });
  it("een gearchiveerd voertuig kan niet nieuw gekozen worden", async () => {
    const v = await maakVoertuig("t1", { kenteken: "AB12CD", omschrijving: "Bus" });
    await zetVoertuigArchief("t1", v.id, true);
    await expect(nieuweRit("t1", invoer({ voertuigId: v.id }))).rejects.toMatchObject({ status: 422 });
  });
  it("waarschuwt bij een dubbele boeking maar slaat de rit toch op", async () => {
    const v = await maakVoertuig("t1", { kenteken: "AB12CD", omschrijving: "Bus" });
    await nieuweRit("t1", invoer({ voertuigId: v.id }));
    const tweede = await nieuweRit("t1", invoer({ voertuigId: v.id, start: "2026-11-05T10:00", eind: "2026-11-05T12:00" }));
    expect(tweede.waarschuwingen).toHaveLength(1);
    expect(tweede.waarschuwingen[0]).toContain("AB-12-CD");
    expect(tweede.waarschuwingen[0]).toContain("R-2026-0001");
    expect(await lijstRitten("t1")).toHaveLength(2);
  });
  it("een rit in een andere organisatie telt niet mee voor de waarschuwing", async () => {
    await bewaarChauffeurs("t1", { namen: ["Piet"] });
    await bewaarChauffeurs("t2", { namen: ["Piet"] });
    await nieuweRit("t1", invoer({ chauffeur: "Piet" }));
    expect((await nieuweRit("t2", invoer({ chauffeur: "Piet" }))).waarschuwingen).toEqual([]);
  });
  it("wijzigen laat nummer en status staan en neemt de nieuwe velden over", async () => {
    const { rit } = await nieuweRit("t1", invoer());
    const w = await wijzigRit("t1", rit.id, invoer({ naar: "Amersfoort", km: "42,5" }));
    expect(w.rit).toMatchObject({ nummer: rit.nummer, status: "gepland", naar: "Amersfoort", km: 42.5 });
    await expect(wijzigRit("t2", rit.id, invoer())).rejects.toMatchObject({ status: 404 });
    await expect(wijzigRit("t1", "2026-9999", invoer())).rejects.toMatchObject({ status: 404 });
  });
  it("een rit blijft bewerkbaar nadat zijn chauffeur is gewist", async () => {
    await bewaarChauffeurs("t1", { namen: ["Piet"] });
    const { rit } = await nieuweRit("t1", invoer({ chauffeur: "Piet" }));
    await wisChauffeur("t1", "Piet");
    const w = await wijzigRit("t1", rit.id, invoer({ chauffeur: "Verwijderd", opmerking: "ok" }));
    expect(w.rit.chauffeur).toBe("Verwijderd");
  });
  it("de status volgt de toegestane overgangen en neemt de serverversie terug", async () => {
    const { rit } = await nieuweRit("t1", invoer());
    const onderweg = await zetStatus("t1", rit.id, "onderweg", new Date("2026-11-05T08:05:00Z"));
    expect(onderweg.rit).toMatchObject({ status: "onderweg", werkelijkStart: "2026-11-05T08:05:00.000Z" });
    await expect(zetStatus("t1", rit.id, "gepland", new Date())).resolves.toBeTruthy();
    await expect(zetStatus("t1", rit.id, "afgeleverd", new Date())).rejects.toMatchObject({ status: 422 });
    await expect(zetStatus("t2", rit.id, "onderweg", new Date())).rejects.toMatchObject({ status: 404 });
  });
  it("verwijderen kan alleen bij gepland of geannuleerd", async () => {
    const { rit } = await nieuweRit("t1", invoer());
    await zetStatus("t1", rit.id, "onderweg");
    await expect(verwijderRit("t1", rit.id)).rejects.toMatchObject({ status: 409 });
    await zetStatus("t1", rit.id, "geannuleerd");
    await verwijderRit("t1", rit.id);
    expect(await leesRit("t1", rit.id)).toBeNull();
    await expect(verwijderRit("t1", rit.id)).rejects.toMatchObject({ status: 404 });
  });
  it("klantgegevens wissen laat de rit staan en kan andere organisaties niet raken", async () => {
    const { rit } = await nieuweRit("t1", invoer({ tussenstops: ["Gouda"], lading: "Pallets" }));
    const w = await wisKlant("t1", rit.id);
    expect(w).toMatchObject({ klantNaam: "", van: "", naar: "", tussenstops: [], klantGewist: true, lading: "Pallets" });
    expect(await leesRit("t1", rit.id)).toMatchObject({ klantGewist: true, klantNaam: "" });
    await expect(wisKlant("t2", rit.id)).rejects.toMatchObject({ status: 404 });
    // na het wissen kan de rit bewerkt worden zonder van en naar
    await expect(wijzigRit("t1", rit.id, invoer({ van: "", naar: "", klantNaam: "" }))).resolves.toMatchObject({ rit: { klantGewist: true } });
  });
  it("een rit-id met rare tekens bestaat niet", async () => {
    expect(await leesRit("t1", "constructor")).toBeNull();
    expect(await leesRit("t1", "../2026-0001")).toBeNull();
  });
});
